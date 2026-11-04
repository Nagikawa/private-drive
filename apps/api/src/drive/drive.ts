import { Context, Effect, FileSystem, Layer, Stream } from "effect"
import {
  DeleteResult,
  FileEntry,
  FolderEntry,
  Listing,
  MoveResult,
  NotFound,
  SourceStatus,
  StorageError,
  connectedResource,
  folderName,
  isDirectChildFolder,
  isImageContent,
  isWithinFolder,
  normalizeFolder,
  pure,
  nameKeepingType,
  sanitizeFileName,
  splitStorageKey,
  storageKey,
  uniqueName,
  type SourceId,
} from "@private-drive/domain"
import { Catalog } from "../index/catalog.ts"
import { StoredFile } from "../index/schema.ts"
import { addEntry, createdAt, rememberFolder, rememberFolderTree, replaceCatalog } from "../index/update.ts"
import { HuggingFace } from "../storage/huggingface.ts"
import { R2 } from "../storage/r2.ts"
import { keepName, labels, limits, unavailable, type RemoteListing } from "../storage/shared.ts"
import { Telegram } from "../storage/telegram.ts"
import { downloadPublic } from "./download.ts"

// Rejects a folder string that could escape the drive root before any provider is called.
const requireFolder = Effect.fn("Drive.requireFolder")(function*(input: string) {
  return yield* normalizeFolder(input).pipe(
    Effect.mapError(() => new StorageError({ message: "Invalid folder path" })),
  )
})

// Turns a provider probe into a source card, including the unconfigured case the UI hides.
const sourceStatus = Effect.fn("Drive.sourceStatus")(function*(
  id: SourceId,
  check: Effect.Effect<string, StorageError> | undefined,
) {
  if (check === undefined) {
    return new SourceStatus({ connected: false, detail: "Not configured", id, label: labels[id] })
  }
  const detail = yield* check.pipe(Effect.catch((error) => Effect.succeed(error.message)))
  // A missing resource name is a tagged failure. The source stays disconnected and nothing is thrown.
  const resource = yield* connectedResource(detail).pipe(
    Effect.catchTag("ResourceNameError", () => Effect.succeed(undefined)),
  )
  return new SourceStatus({ connected: resource !== undefined, detail, id, label: labels[id] })
})

export class Drive extends Context.Service<Drive, {
  createFolder(source: SourceId, path: string): Effect.Effect<FolderEntry, StorageError>
  deleteFolder(source: SourceId, path: string): Effect.Effect<void, NotFound | StorageError>
  list(input: {
    readonly folder: string
    readonly kind: "all" | "image"
    readonly recursive: boolean
    readonly search: string
    readonly source: SourceId
  }): Effect.Effect<Listing, StorageError>
  read(id: string): Effect.Effect<{
    readonly body: Stream.Stream<Uint8Array, StorageError>
    readonly contentType: string
    readonly name: string
    readonly size: number
  }, NotFound | StorageError>
  remove(ids: ReadonlyArray<string>): Effect.Effect<DeleteResult, StorageError>
  move(ids: ReadonlyArray<string>, folder: string): Effect.Effect<MoveResult, StorageError>
  rename(id: string, name: string): Effect.Effect<FileEntry, StorageError>
  sources(): Effect.Effect<ReadonlyArray<SourceStatus>>
  upload(input: {
    readonly contentType: string
    readonly folder: string
    readonly name: string
    readonly path: string
    readonly size: number
    readonly source: SourceId
  }): Effect.Effect<FileEntry, StorageError>
  uploadUrl(source: SourceId, folder: string, url: string): Effect.Effect<FileEntry, StorageError>
}>()("private-drive/Drive") {
  // Wires the index and the three stores into the operations the HTTP routes call.
  static readonly layer = Layer.effect(
    Drive,
    Effect.gen(function*() {
      const catalog = yield* Catalog
      const fs = yield* FileSystem.FileSystem
      const r2 = yield* R2
      const telegram = yield* Telegram
      const huggingface = yield* HuggingFace

      // Projects an index row into the HTTP file shape, including whether the browser can preview it as an image.
      const toEntry = Effect.fnUntraced(function*(file: StoredFile) {
        return new FileEntry({
          contentType: file.contentType,
          createdAt: file.createdAt,
          folder: file.folder,
          id: file.id,
          image: yield* isImageContent(file.contentType),
          name: file.name,
          size: file.size,
          source: file.source,
        })
      })

      // Stops a write early when the chosen source has no credentials.
      const ensureSource = Effect.fn("Drive.ensureSource")(function*(source: SourceId) {
        const ready = source === "r2"
          ? r2.configured
          : source === "telegram"
          ? telegram.configured
          : huggingface.configured
        if (!ready) {
          return yield* unavailable(source)
        }
      })

      // Opens a byte stream from the store that owns the index row.
      const openBody = Effect.fn("Drive.openBody")(function*(entry: StoredFile) {
        if (entry.source === "r2") {
          return yield* r2.open(entry.storageKey)
        }
        if (entry.source === "huggingface") {
          return yield* huggingface.open(entry.storageKey)
        }
        return yield* telegram.open(entry.storageKey)
      })

      // Asks the listing provider for the folder, and leaves Telegram to the local index.
      const remoteListing = Effect.fn("Drive.remoteListing")(function*(
        source: SourceId,
        folder: string,
        recursive: boolean,
      ) {
        if (source === "r2") {
          return yield* r2.list(folder, recursive)
        }
        if (source === "huggingface") {
          return yield* huggingface.list(folder, recursive)
        }
        const empty: RemoteListing = { files: [], folders: [], truncated: false }
        return empty
      })

      // Stores the temp file, then records it so later lists do not depend on a second remote scan.
      const saveUpload = Effect.fn("Drive.saveUpload")(function*(input: {
        readonly contentType: string
        readonly folder: string
        readonly name: string
        readonly path: string
        readonly size: number
        readonly source: SourceId
      }) {
        yield* ensureSource(input.source)
        const folder = yield* requireFolder(input.folder)
        const safeName = yield* sanitizeFileName(input.name).pipe(
          Effect.mapError(() => new StorageError({ message: "Invalid file name" })),
        )
        const limit = limits[input.source]
        if (limit !== undefined && input.size > limit) {
          return yield* new StorageError({
            message: `${labels[input.source]} file size limit is ${Math.floor(limit / (1024 * 1024))} MB`,
          })
        }
        const current = yield* catalog.read
        const used = new Set(
          current.entries.filter((entry) => entry.source === input.source && entry.folder === folder).map((entry) =>
            entry.name
          ),
        )
        const name = yield* uniqueName(safeName, used)
        const key = yield* storageKey(folder, name)
        let storageKeyValue = key
        let telegramMessageId: number | undefined
        if (input.source === "telegram") {
          const bytes = yield* fs.readFile(input.path).pipe(
            Effect.mapError(() => new StorageError({ message: "Could not read the uploaded temporary file" })),
          )
          const stored = yield* telegram.put(key, bytes, input.contentType)
          storageKeyValue = stored.storageKey
          telegramMessageId = stored.messageId
        } else if (input.source === "huggingface") {
          yield* huggingface.putFile(key, input.path, input.size)
        } else {
          yield* r2.putFile(key, input.path, input.size, input.contentType)
        }
        const stamp = yield* createdAt()
        const record = new StoredFile({
          contentType: input.contentType,
          createdAt: stamp,
          folder,
          id: crypto.randomUUID(),
          name,
          size: input.size,
          source: input.source,
          storageKey: storageKeyValue,
          ...(telegramMessageId === undefined ? {} : { telegramMessageId: Math.trunc(telegramMessageId) }),
        })
        yield* catalog.modify((data) => {
          const folders = folder === "" ? data.folders : rememberFolderTree(data.folders, input.source, folder)
          return [replaceCatalog(data, [...data.entries, record], folders), record] as const
        })
        return yield* toEntry(record)
      })

      // Reconciles the remote listing into the index, then filters it for the folder the UI asked for.
      const list = Effect.fn("Drive.list")(function*(input: {
        readonly folder: string
        readonly kind: "all" | "image"
        readonly recursive: boolean
        readonly search: string
        readonly source: SourceId
      }) {
        yield* ensureSource(input.source)
        const folder = yield* requireFolder(input.folder)
        const remote = yield* remoteListing(input.source, folder, input.recursive)
        const stamp = yield* createdAt()
        const data = yield* catalog.modify((incoming) => {
          let current = incoming
          // Telegram has no history listing, so the local index stays the only record.
          if (input.source === "telegram") {
            return [current, current] as const
          }
          const remoteKeys = new Set(remote.files.map((file) => file.key))
          for (const file of remote.files) {
            const parts = pure(splitStorageKey(file.key), { folder: "", name: file.key })
            if (parts.name === keepName) {
              continue
            }
            if (!current.entries.some((entry) => entry.source === input.source && entry.storageKey === file.key)) {
              current = addEntry(current, new StoredFile({
                contentType: file.contentType,
                createdAt: stamp,
                folder: parts.folder,
                id: crypto.randomUUID(),
                name: parts.name,
                size: Math.trunc(file.size),
                source: input.source,
                storageKey: file.key,
              }))
            }
          }
          // A capped page must not delete rows it never saw. A complete page drops rows the store no longer has.
          const inScope = (entry: StoredFile) =>
            entry.source === input.source &&
            (input.recursive ? pure(isWithinFolder(folder, entry.folder), false) : entry.folder === folder)
          const entries = remote.truncated
            ? current.entries
            : current.entries.filter((entry) => !inScope(entry) || remoteKeys.has(entry.storageKey))
          let folders = current.folders
          for (const path of remote.folders) {
            folders = rememberFolder(folders, input.source, path)
          }
          const next = replaceCatalog(current, entries, folders)
          return [next, next] as const
        })
        const query = input.search.trim().toLowerCase()
        const files: Array<StoredFile> = []
        for (const entry of data.entries) {
          if (entry.source !== input.source || entry.name === keepName) {
            continue
          }
          const inFolder = input.recursive
            ? pure(isWithinFolder(folder, entry.folder), false)
            : entry.folder === folder
          if (!inFolder) {
            continue
          }
          if (input.kind === "image" && !(yield* isImageContent(entry.contentType))) {
            continue
          }
          if (query !== "" && !entry.name.toLowerCase().includes(query)) {
            continue
          }
          files.push(entry)
        }
        const folderPaths = new Set<string>([
          ...data.folders.filter((item) => item.source === input.source).map((item) => item.path),
          ...remote.folders,
        ])
        const folders = [...folderPaths].filter((path) =>
          (input.recursive
            ? path !== folder && pure(isWithinFolder(folder, path), false)
            : pure(isDirectChildFolder(folder, path), false)) &&
          (query === "" || pure(folderName(path), path).toLowerCase().includes(query))
        )
        return new Listing({
          files: (yield* Effect.forEach(files, toEntry)).sort((left, right) =>
            left.name.localeCompare(right.name, "zh-Hant")
          ),
          folder,
          folders: folders.sort((left, right) => left.localeCompare(right, "zh-Hant")).map((path) =>
            new FolderEntry({ name: pure(folderName(path), path), path })
          ),
          source: input.source,
          truncated: remote.truncated,
        })
      })

      return Drive.of({
        // Writes a folder marker and remembers the path so an empty folder still appears in the tree.
        createFolder: Effect.fn("Drive.createFolder")(function*(source, path) {
          yield* ensureSource(source)
          const folder = yield* requireFolder(path)
          if (folder === "") {
            return yield* new StorageError({ message: "Enter a folder name" })
          }
          if (source === "r2") {
            yield* r2.put(`${folder}/${keepName}`, new Uint8Array(), "application/octet-stream")
          } else if (source === "huggingface") {
            yield* huggingface.put(`${folder}/${keepName}`, new Uint8Array())
          }
          yield* catalog.modify((data) => [
            replaceCatalog(data, data.entries, rememberFolderTree(data.folders, source, folder)),
            undefined,
          ] as const)
          return new FolderEntry({ name: yield* folderName(folder), path: folder })
        }),
        // Removes an empty folder and its marker, and refuses Root so the drive always has a home.
        deleteFolder: Effect.fn("Drive.deleteFolder")(function*(source, path) {
          yield* ensureSource(source)
          const folder = yield* requireFolder(path)
          if (folder === "") {
            return yield* new StorageError({ message: "Cannot delete Root" })
          }
          const current = yield* catalog.read
          const occupied = current.entries.some((entry) =>
            entry.source === source && entry.name !== keepName && pure(isWithinFolder(folder, entry.folder), false)
          ) || current.folders.some((item) =>
            item.source === source && item.path !== folder && pure(isWithinFolder(folder, item.path), false)
          )
          if (occupied) {
            return yield* new StorageError({ message: "The folder is not empty" })
          }
          const known = current.folders.some((item) => item.source === source && item.path === folder)
          if (!known) {
            return yield* new NotFound({ message: "Folder not found" })
          }
          if (source === "r2") {
            yield* r2.delete(`${folder}/${keepName}`)
          } else if (source === "huggingface") {
            yield* huggingface.delete(`${folder}/${keepName}`)
          }
          yield* catalog.modify((data) => [
            replaceCatalog(
              data,
              data.entries,
              data.folders.filter((item) => !(item.source === source && item.path === folder)),
            ),
            undefined,
          ] as const)
        }),
        list,
        // Opens one file as a byte stream for the content route after the id is found in the index.
        read: Effect.fn("Drive.read")(function*(id: string) {
          const current = yield* catalog.read
          const entry = current.entries.find((item) => item.id === id)
          if (entry === undefined) {
            return yield* new NotFound({ message: "File not found" })
          }
          const body = yield* openBody(entry)
          return { body, contentType: entry.contentType, name: entry.name, size: entry.size }
        }),
        // Deletes each selected file from its store, then drops the index row.
        remove: Effect.fn("Drive.remove")(function*(ids: ReadonlyArray<string>) {
          let removed = 0
          for (const id of ids) {
            const current = yield* catalog.read
            const entry = current.entries.find((item) => item.id === id)
            if (entry === undefined) {
              continue
            }
            if (entry.source === "r2") {
              yield* r2.delete(entry.storageKey)
            } else if (entry.source === "huggingface") {
              yield* huggingface.delete(entry.storageKey)
            } else if (entry.telegramMessageId !== undefined && telegram.configured) {
              yield* telegram.deleteMessage(entry.telegramMessageId)
            }
            yield* catalog.modify((data) => [
              replaceCatalog(data, data.entries.filter((item) => item.id !== id), data.folders),
              undefined,
            ] as const)
            removed += 1
          }
          return new DeleteResult({ removed })
        }),
        // Moves files inside one source, copying remote objects when the storage key has to change.
        move: Effect.fn("Drive.move")(function*(ids: ReadonlyArray<string>, folderInput: string) {
          const destination = yield* requireFolder(folderInput)
          if (ids.length === 0) {
            return yield* new StorageError({ message: "Choose files" })
          }
          const current = yield* catalog.read
          const files: Array<StoredFile> = []
          for (const id of ids) {
            const entry = current.entries.find((item) => item.id === id)
            if (entry === undefined) {
              return yield* new StorageError({ message: "File not found" })
            }
            files.push(entry)
          }
          const names = new Set<string>()
          for (const entry of files) {
            if (names.has(entry.name)) {
              return yield* new StorageError({ message: `Selected files include a duplicate name "${entry.name}"` })
            }
            names.add(entry.name)
            const occupied = current.entries.some((item) =>
              item.id !== entry.id &&
              item.source === entry.source &&
              item.folder === destination &&
              item.name === entry.name
            )
            if (occupied) {
              return yield* new StorageError({ message: `"${entry.name}" already exists in the destination folder` })
            }
          }
          const pending = files.filter((entry) => entry.folder !== destination)
          if (pending.length === 0) {
            return yield* new StorageError({ message: "The file is already in this folder" })
          }
          let moved = 0
          for (const entry of pending) {
            yield* ensureSource(entry.source)
            const nextKey = yield* storageKey(destination, entry.name)
            if (entry.source === "r2" && entry.storageKey !== nextKey) {
              yield* r2.copy(entry.storageKey, nextKey)
              yield* r2.delete(entry.storageKey)
            } else if (entry.source === "huggingface" && entry.storageKey !== nextKey) {
              const bytes = yield* huggingface.get(entry.storageKey)
              yield* huggingface.put(nextKey, bytes)
              yield* huggingface.delete(entry.storageKey)
            }
            const relocated = new StoredFile({
              contentType: entry.contentType,
              createdAt: entry.createdAt,
              folder: destination,
              id: entry.id,
              name: entry.name,
              size: entry.size,
              source: entry.source,
              storageKey: entry.source === "telegram" ? entry.storageKey : nextKey,
              ...(entry.telegramMessageId === undefined ? {} : { telegramMessageId: entry.telegramMessageId }),
            })
            yield* catalog.modify((data) => {
              const entries = data.entries.map((item) => item.id === entry.id ? relocated : item)
              const folders = destination === ""
                ? data.folders
                : rememberFolderTree(data.folders, entry.source, destination)
              return [replaceCatalog(data, entries, folders), undefined] as const
            })
            moved += 1
          }
          return new MoveResult({ moved })
        }),
        // Renames one file while keeping its stored extension and content type.
        rename: Effect.fn("Drive.rename")(function*(id: string, requested: string) {
          const current = yield* catalog.read
          const entry = current.entries.find((item) => item.id === id)
          if (entry === undefined) {
            return yield* new StorageError({ message: "File not found" })
          }
          const name = yield* nameKeepingType(entry.name, requested).pipe(
            Effect.mapError(() => new StorageError({ message: "Invalid file name" })),
          )
          if (name === entry.name) {
            return yield* toEntry(entry)
          }
          const occupied = current.entries.some((item) =>
            item.id !== entry.id &&
            item.source === entry.source &&
            item.folder === entry.folder &&
            item.name === name
          )
          if (occupied) {
            return yield* new StorageError({ message: `"${name}" already exists in this folder` })
          }
          yield* ensureSource(entry.source)
          const nextKey = yield* storageKey(entry.folder, name)
          if (entry.source === "r2" && entry.storageKey !== nextKey) {
            yield* r2.copy(entry.storageKey, nextKey)
            yield* r2.delete(entry.storageKey)
          } else if (entry.source === "huggingface" && entry.storageKey !== nextKey) {
            const bytes = yield* huggingface.get(entry.storageKey)
            yield* huggingface.put(nextKey, bytes)
            yield* huggingface.delete(entry.storageKey)
          }
          const renamed = new StoredFile({
            contentType: entry.contentType,
            createdAt: entry.createdAt,
            folder: entry.folder,
            id: entry.id,
            name,
            size: entry.size,
            source: entry.source,
            storageKey: entry.source === "telegram" ? entry.storageKey : nextKey,
            ...(entry.telegramMessageId === undefined ? {} : { telegramMessageId: entry.telegramMessageId }),
          })
          yield* catalog.modify((data) => [
            replaceCatalog(
              data,
              data.entries.map((item) => item.id === entry.id ? renamed : item),
              data.folders,
            ),
            undefined,
          ] as const)
          return yield* toEntry(renamed)
        }),
        // Probes each configured store so the shell can hide sources that are not set up.
        sources: Effect.fn("Drive.sources")(function*() {
          const statuses = [
            yield* sourceStatus("r2", r2.configured ? r2.status() : undefined),
            yield* sourceStatus("telegram", telegram.configured ? telegram.status() : undefined),
            yield* sourceStatus("huggingface", huggingface.configured ? huggingface.status() : undefined),
          ] as const
          return statuses
        }),
        upload: saveUpload,
        // Fetches a public URL, then stores it with the same rules as a direct upload.
        uploadUrl: Effect.fn("Drive.uploadUrl")(function*(source, folder, url) {
          return yield* Effect.scoped(Effect.gen(function*() {
            const downloaded = yield* downloadPublic(url, limits[source], fs)
            return yield* saveUpload({
              contentType: downloaded.contentType,
              folder,
              name: downloaded.name,
              path: downloaded.path,
              size: downloaded.size,
              source,
            })
          }))
        }),
      })
    }),
  ).pipe(
    Layer.provide(Catalog.layer),
    Layer.provide(R2.layer),
    Layer.provide(Telegram.layer),
    Layer.provide(HuggingFace.layer),
  )
}
