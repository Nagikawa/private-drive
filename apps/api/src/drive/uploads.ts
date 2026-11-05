import { open, rm } from "node:fs/promises"
import { Context, Effect, FileSystem, Layer, Path } from "effect"
import {
  FileEntry,
  OpenUpload,
  StorageError,
  UploadProgress,
  normalizeFolder,
  uploadChunkBytes,
  type SourceId,
} from "@private-drive/domain"
import { AppConfig } from "../config.ts"
import { Drive } from "./drive.ts"

interface StoredUpload {
  readonly contentType: string
  readonly folder: string
  readonly id: string
  readonly name: string
  readonly offset: number
  readonly path: string
  readonly size: number
  readonly source: SourceId
}

const parse = (text: string): Array<StoredUpload> => {
  try {
    const value: unknown = JSON.parse(text)
    if (!Array.isArray(value)) {
      return []
    }
    return value.filter((item): item is StoredUpload => {
      if (typeof item !== "object" || item === null) {
        return false
      }
      const row = item as Partial<StoredUpload>
      return row.source === "r2" || row.source === "telegram" || row.source === "huggingface"
        ? typeof row.id === "string" &&
            typeof row.name === "string" &&
            typeof row.folder === "string" &&
            typeof row.path === "string" &&
            typeof row.contentType === "string" &&
            typeof row.offset === "number" &&
            typeof row.size === "number"
        : false
    })
  } catch {
    return []
  }
}

const progress = (upload: StoredUpload): UploadProgress =>
  new UploadProgress({ id: upload.id, name: upload.name, offset: upload.offset, size: upload.size })

// Keeps an interrupted upload on disk so the same file can continue after a refresh.
export class Uploads extends Context.Service<
  Uploads,
  {
    readonly append: (
      id: string,
      start: number,
      bytes: Uint8Array,
    ) => Effect.Effect<UploadProgress, StorageError>
    readonly complete: (id: string) => Effect.Effect<FileEntry, StorageError>
    readonly list: (
      source: SourceId,
      folder: string,
    ) => Effect.Effect<ReadonlyArray<UploadProgress>, StorageError>
    readonly open: (input: OpenUpload) => Effect.Effect<UploadProgress, StorageError>
  }
>()("private-drive/Uploads") {
  static readonly layer = Layer.effect(
    Uploads,
    Effect.gen(function* () {
      const config = yield* AppConfig
      const drive = yield* Drive
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const directory = path.join(path.dirname(config.indexPath), "uploads")
      const bookPath = path.join(directory, "sessions.json")

      const load = Effect.fn("Uploads.load")(function* () {
        const exists = yield* fs.exists(bookPath).pipe(Effect.catch(() => Effect.succeed(false)))
        if (!exists) {
          return [] as Array<StoredUpload>
        }
        const text = yield* fs.readFileString(bookPath).pipe(Effect.catch(() => Effect.succeed("")))
        return parse(text)
      })

      const save = Effect.fn("Uploads.save")(function* (uploads: ReadonlyArray<StoredUpload>) {
        yield* fs
          .makeDirectory(directory, { recursive: true })
          .pipe(
            Effect.mapError(
              () => new StorageError({ message: "Could not create the upload directory" }),
            ),
          )
        yield* fs
          .writeFileString(bookPath, JSON.stringify(uploads))
          .pipe(Effect.mapError(() => new StorageError({ message: "Could not record the upload" })))
      })

      return Uploads.of({
        // Reuses an upload of the same file, or starts a new temporary file at byte zero.
        open: (input) =>
          Effect.gen(function* () {
            if (input.size < 0) {
              return yield* new StorageError({ message: "Invalid file size" })
            }
            const folder = yield* normalizeFolder(input.folder).pipe(
              Effect.mapError(() => new StorageError({ message: "Invalid folder path" })),
            )
            const current = yield* load()
            const existing = current.find(
              (item) =>
                item.source === input.source &&
                item.folder === folder &&
                item.name === input.name &&
                item.size === input.size,
            )
            if (existing !== undefined) {
              return progress(existing)
            }
            const id = crypto.randomUUID()
            const filePath = path.join(directory, id)
            yield* fs
              .makeDirectory(directory, { recursive: true })
              .pipe(
                Effect.mapError(
                  () => new StorageError({ message: "Could not create the upload directory" }),
                ),
              )
            yield* fs
              .writeFile(filePath, new Uint8Array())
              .pipe(
                Effect.mapError(() => new StorageError({ message: "Could not start the upload" })),
              )
            const upload: StoredUpload = {
              contentType:
                input.contentType === "" ? "application/octet-stream" : input.contentType,
              folder,
              id,
              name: input.name,
              offset: 0,
              path: filePath,
              size: input.size,
              source: input.source,
            }
            yield* save([...current, upload])
            return progress(upload)
          }),
        list: (source, folder) =>
          Effect.gen(function* () {
            const normalized = yield* normalizeFolder(folder).pipe(
              Effect.mapError(() => new StorageError({ message: "Invalid folder path" })),
            )
            const current = yield* load()
            return current
              .filter((item) => item.source === source && item.folder === normalized)
              .map(progress)
          }),
        // Writes the next slice at the byte the server already has.
        append: (id, start, bytes) =>
          Effect.gen(function* () {
            if (bytes.byteLength > uploadChunkBytes) {
              return yield* new StorageError({ message: "Upload chunk is too large" })
            }
            const current = yield* load()
            const upload = current.find((item) => item.id === id)
            if (upload === undefined) {
              return yield* new StorageError({ message: "Upload not found" })
            }
            if (start !== upload.offset) {
              return yield* new StorageError({
                message: `Resume this upload at byte ${upload.offset}`,
              })
            }
            const next = upload.offset + bytes.byteLength
            if (next > upload.size) {
              return yield* new StorageError({ message: "Upload is larger than the file" })
            }
            yield* Effect.tryPromise({
              catch: () => new StorageError({ message: "Could not write the upload chunk" }),
              try: async () => {
                const handle = await open(upload.path, "r+")
                await handle.write(bytes, 0, bytes.byteLength, start)
                await handle.close()
              },
            })
            const updated = { ...upload, offset: next }
            yield* save(current.map((item) => (item.id === id ? updated : item)))
            return progress(updated)
          }),
        // Stores the finished temporary file with the same rules as a direct upload.
        complete: (id) =>
          Effect.gen(function* () {
            const current = yield* load()
            const upload = current.find((item) => item.id === id)
            if (upload === undefined) {
              return yield* new StorageError({ message: "Upload not found" })
            }
            if (upload.offset !== upload.size) {
              return yield* new StorageError({
                message: `Resume this upload at byte ${upload.offset}`,
              })
            }
            const entry = yield* drive.upload({
              contentType: upload.contentType,
              folder: upload.folder,
              name: upload.name,
              path: upload.path,
              size: upload.size,
              source: upload.source,
            })
            yield* save(current.filter((item) => item.id !== id))
            yield* Effect.tryPromise({
              catch: () => undefined,
              try: () => rm(upload.path, { force: true }),
            }).pipe(Effect.ignore)
            return entry
          }),
      })
    }),
  )
}
