import { Context, Effect, FileSystem, Layer, Redacted, Stream } from "effect"
import {
  DeleteResult,
  FileEntry,
  FolderEntry,
  Listing,
  MoveResult,
  NotFound,
  ShareLink,
  SourceStatus,
  StorageError,
  connectedResource,
  folderName,
  isDirectChildFolder,
  isImageContent,
  isWithinFolder,
  normalizeFolder,
  pageFiles,
  pure,
  nameKeepingType,
  sanitizeFileName,
  storageKey,
  uniqueName,
  type SourceId,
} from "@private-drive/domain"
import { AuditLog } from "../audit/log.ts"
import { shareLifetime, signContent } from "../auth/share.ts"
import { AppConfig } from "../config.ts"
import { Catalog } from "../index/catalog.ts"
import { reconcileRemote } from "./reconcile.ts"
import { StoredFile } from "../index/schema.ts"
import { createdAt, rememberFolderTree, replaceCatalog } from "../index/update.ts"
import type { FileStore } from "../storage/file-store.ts"
import { keepName, unavailable } from "../storage/shared.ts"
import { Stores } from "../storage/stores.ts"
import { downloadPublic } from "./download.ts"

// Rejects a folder string that could escape the drive root before any provider is called.
const requireFolder = Effect.fn("Drive.requireFolder")(function*(input: string) {
  return yield* normalizeFolder(input).pipe(
    Effect.mapError(() => new StorageError({ message: "Invalid folder path" })),
  )
})

// Turns a provider probe into a source card, including the unconfigured case the UI hides.
const sourceStatus = Effect.fn("Drive.sourceStatus")(function*(store: FileStore) {
  if (!store.configured) {
    return new SourceStatus({ connected: false, detail: "Not configured", id: store.id, label: store.label })
  }
  const detail = yield* store.status().pipe(Effect.catch((error) => Effect.succeed(error.message)))
  // A missing resource name is a tagged failure. The source stays disconnected and nothing is thrown.
  const resource = yield* connectedResource(detail).pipe(
    Effect.catchTag("ResourceNameError", () => Effect.succeed(undefined)),
  )
  return new SourceStatus({ connected: resource !== undefined, detail, id: store.id, label: store.label })
})

export class Drive extends Context.Service<Drive, {
  createFolder(source: SourceId, path: string): Effect.Effect<FolderEntry, StorageError>
  deleteFolder(source: SourceId, path: string): Effect.Effect<void, NotFound | StorageError>
  list(input: {
    readonly cursor?: string
    readonly folder: string
    readonly kind: "all" | "image"
    readonly order: "asc" | "desc"
    readonly recursive: boolean
    readonly search: string
    readonly sort: "name" | "size" | "created" | "type"
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
  share(id: string): Effect.Effect<ShareLink, NotFound | StorageError>
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
  // Wires the index and the store registry into the operations the HTTP routes call.
  static readonly layer = Layer.effect(
    Drive,
    Effect.gen(function*() {
      const audit = yield* AuditLog
      const config = yield* AppConfig
      const catalog = yield* Catalog
      const secret = Redacted.value(config.sessionSecret)
      const fs = yield* FileSystem.FileSystem
      const stores = yield* Stores

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
      const ensureStore = Effect.fn("Drive.ensureStore")(function*(source: SourceId) {
        const store = stores.get(source)
        if (!store.configured) {
          return yield* unavailable(source)
        }
        return store
      })

      // Opens a byte stream from the store that owns the index row.
      const openBody = Effect.fn("Drive.openBody")(function*(entry: StoredFile) {
        return yield* stores.get(entry.source).open(entry.storageKey)
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
        const store = yield* ensureStore(input.source)
        const folder = yield* requireFolder(input.folder)
        const safeName = yield* sanitizeFileName(input.name).pipe(
          Effect.mapError(() => new StorageError({ message: "Invalid file name" })),
        )
        const limit = store.byteLimit
        if (limit !== undefined && input.size > limit) {
          return yield* new StorageError({
            message: `${store.label} file size limit is ${Math.floor(limit / (1024 * 1024))} MB`,
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
        const placed = yield* store.putFile(key, input.path, input.size, input.contentType)
        const stamp = yield* createdAt()
        const record = new StoredFile({
          contentType: input.contentType,
          createdAt: stamp,
          folder,
          id: crypto.randomUUID(),
          name,
          size: input.size,
          source: input.source,
          storageKey: placed.storageKey,
          ...(placed.telegramMessageId === undefined ? {} : { telegramMessageId: placed.telegramMessageId }),
        })
        yield* catalog.modify((data) => {
          const folders = folder === "" ? data.folders : rememberFolderTree(data.folders, input.source, folder)
          return [replaceCatalog(data, [...data.entries, record], folders), record] as const
        }).pipe(
          // The object is already stored. Drop it when the index cannot record it, so the bucket does not keep an orphan.
          Effect.tapError(() =>
            store.remove(placed.storageKey, placed.telegramMessageId).pipe(Effect.catch(() => Effect.void))
          ),
        )
        yield* audit.record("upload", `${input.source} ${folder}/${name}`)
        return yield* toEntry(record)
      })

      // Reconciles the remote listing into the index, then filters it for the folder the UI asked for.
      const list = Effect.fn("Drive.list")(function*(input: {
        readonly cursor?: string
        readonly folder: string
        readonly kind: "all" | "image"
        readonly order: "asc" | "desc"
        readonly recursive: boolean
        readonly search: string
        readonly sort: "name" | "size" | "created" | "type"
        readonly source: SourceId
      }) {
        const store = yield* ensureStore(input.source)
        const folder = yield* requireFolder(input.folder)
        const remote = store.listsRemotely
          ? yield* store.list(folder, input.recursive)
          : { files: [], folders: [], truncated: false }
        const stamp = yield* createdAt()
        const data = yield* catalog.modify((incoming) => {
          const next = reconcileRemote({
            current: incoming,
            folder,
            listsRemotely: store.listsRemotely,
            recursive: input.recursive,
            remote,
            source: input.source,
            stamp,
          })
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
        const page = pageFiles(yield* Effect.forEach(files, toEntry), {
          ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
          order: input.order,
          sort: input.sort,
        })
        return new Listing({
          files: page.files,
          folder,
          folders: folders.sort((left, right) => left.localeCompare(right, "zh-Hant")).map((path) =>
            new FolderEntry({ name: pure(folderName(path), path), path })
          ),
          ...(page.next === undefined ? {} : { next: page.next }),
          source: input.source,
          truncated: remote.truncated,
        })
      })

      return Drive.of({
        // Writes a folder marker and remembers the path so an empty folder still appears in the tree.
        createFolder: Effect.fn("Drive.createFolder")(function*(source, path) {
          const store = yield* ensureStore(source)
          const folder = yield* requireFolder(path)
          if (folder === "") {
            return yield* new StorageError({ message: "Enter a folder name" })
          }
          yield* store.putMarker(folder)
          yield* catalog.modify((data) => [
            replaceCatalog(data, data.entries, rememberFolderTree(data.folders, source, folder)),
            undefined,
          ] as const)
          yield* audit.record("create-folder", `${source} ${folder}`)
          return new FolderEntry({ name: yield* folderName(folder), path: folder })
        }),
        // Removes an empty folder and its marker, and refuses Root so the drive always has a home.
        deleteFolder: Effect.fn("Drive.deleteFolder")(function*(source, path) {
          const store = yield* ensureStore(source)
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
          yield* store.deleteMarker(folder)
          yield* catalog.modify((data) => [
            replaceCatalog(
              data,
              data.entries,
              data.folders.filter((item) => !(item.source === source && item.path === folder)),
            ),
            undefined,
          ] as const)
          yield* audit.record("delete-folder", `${source} ${folder}`)
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
            yield* stores.get(entry.source).remove(entry.storageKey, entry.telegramMessageId)
            yield* catalog.modify((data) => [
              replaceCatalog(data, data.entries.filter((item) => item.id !== id), data.folders),
              undefined,
            ] as const)
            removed += 1
          }
          yield* audit.record("delete", String(removed))
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
            const store = yield* ensureStore(entry.source)
            const nextKey = yield* storageKey(destination, entry.name)
            const storageKeyValue = yield* store.relocate(entry.storageKey, nextKey)
            const relocated = new StoredFile({
              contentType: entry.contentType,
              createdAt: entry.createdAt,
              folder: destination,
              id: entry.id,
              name: entry.name,
              size: entry.size,
              source: entry.source,
              storageKey: storageKeyValue,
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
          yield* audit.record("move", `${moved} -> ${destination}`)
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
          const store = yield* ensureStore(entry.source)
          const nextKey = yield* storageKey(entry.folder, name)
          const storageKeyValue = yield* store.relocate(entry.storageKey, nextKey)
          const renamed = new StoredFile({
            contentType: entry.contentType,
            createdAt: entry.createdAt,
            folder: entry.folder,
            id: entry.id,
            name,
            size: entry.size,
            source: entry.source,
            storageKey: storageKeyValue,
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
          yield* audit.record("rename", `${entry.name} -> ${name}`)
          return yield* toEntry(renamed)
        }),
        // Signs a one-hour content URL that works without the session cookie.
        share: Effect.fn("Drive.share")(function*(id: string) {
          const current = yield* catalog.read
          const entry = current.entries.find((item) => item.id === id)
          if (entry === undefined) {
            return yield* new NotFound({ message: "File not found" })
          }
          const expiresAt = Date.now() + shareLifetime
          const signature = signContent(secret, id, expiresAt)
          yield* audit.record("share", entry.name)
          return new ShareLink({
            url: `/api/files/${encodeURIComponent(id)}/content?exp=${expiresAt}&sig=${encodeURIComponent(signature)}`,
          })
        }),
        // Probes each configured store so the shell can hide sources that are not set up.
        sources: Effect.fn("Drive.sources")(function*() {
          const statuses: Array<SourceStatus> = []
          for (const store of stores.all) {
            statuses.push(yield* sourceStatus(store))
          }
          return statuses
        }),
        upload: saveUpload,
        // Fetches a public URL, then stores it with the same rules as a direct upload.
        uploadUrl: Effect.fn("Drive.uploadUrl")(function*(source, folder, url) {
          return yield* Effect.scoped(Effect.gen(function*() {
            const downloaded = yield* downloadPublic(url, stores.get(source).byteLimit, fs)
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
    Layer.provide(Stores.layer),
  )
}
