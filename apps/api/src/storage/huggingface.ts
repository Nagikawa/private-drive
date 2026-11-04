import { createHash } from "node:crypto"
import { ByteSize, Context, Effect, FileSystem, Layer, Option, Redacted, Schema, Stream } from "effect"
import { Headers, HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http"
import * as Base64 from "effect/encoding/Base64"
import { StorageError, contentTypeFromName, splitStorageKey, uploadParts } from "@private-drive/domain"
import { AppConfig } from "../config.ts"
import { bytesOf, unavailable, type RemoteFile, type RemoteListing } from "./shared.ts"

export class HuggingFace extends Context.Service<HuggingFace, {
  readonly configured: boolean
  delete(key: string): Effect.Effect<void, StorageError>
  get(key: string): Effect.Effect<Uint8Array, StorageError>
  list(folder: string, recursive: boolean): Effect.Effect<RemoteListing, StorageError>
  open(key: string): Effect.Effect<Stream.Stream<Uint8Array, StorageError>, StorageError>
  put(key: string, bytes: Uint8Array): Effect.Effect<void, StorageError>
  putFile(key: string, path: string, size: number): Effect.Effect<void, StorageError>
  status(): Effect.Effect<string, StorageError>
}>()("private-drive/api/storage/HuggingFace") {
  // Uses the dataset API for small files and LFS for anything the commit endpoint will not inline.
  static readonly layer = Layer.effect(
    HuggingFace,
    Effect.gen(function*() {
      const config = yield* AppConfig
      const fs = yield* FileSystem.FileSystem
      const raw = yield* HttpClient.HttpClient
      const http = raw.pipe(HttpClient.filterStatusOk)

      // Builds an authenticated dataset URL, or nothing when the repo token is missing.
      const targetFor = (path: string) => {
        if (config.huggingface === undefined) {
          return undefined
        }
        return {
          repo: config.huggingface.repo,
          token: Redacted.value(config.huggingface.token),
          url: `https://huggingface.co/api/datasets/${config.huggingface.repo}${path}`,
        }
      }

      // Commits an ndjson batch so create, upload, and delete share one write path.
      const commit = Effect.fn("HuggingFace.commit")(function*(operations: ReadonlyArray<unknown>) {
        const target = targetFor("/commit/main")
        if (target === undefined) {
          return yield* unavailable("huggingface")
        }
        const body = operations.map((operation) => JSON.stringify(operation)).join("\n")
        yield* HttpClientRequest.post(target.url).pipe(
          HttpClientRequest.bearerToken(target.token),
          HttpClientRequest.bodyText(body, "application/x-ndjson"),
          http.execute,
          Effect.mapError(() => new StorageError({ message: "Hugging Face write failed" })),
        )
      })

      // Stores a file inline when it is small, otherwise uploads the blob through LFS and commits the pointer.
      const put = Effect.fn("HuggingFace.put")(function*(key: string, bytes: Uint8Array) {
        if (bytesOf(bytes) <= 8 * 1024 * 1024) {
          yield* commit([
            { key: "header", value: { description: "", summary: "upload" } },
            { key: "file", value: { content: Base64.encode(bytes), encoding: "base64", path: key } },
          ])
          return
        }
        const target = targetFor("")
        if (target === undefined) {
          return yield* unavailable("huggingface")
        }
        const oid = createHash("sha256").update(bytes).digest("hex")
        const batch = yield* HttpClientRequest.post(
          `https://huggingface.co/datasets/${target.repo}.git/info/lfs/objects/batch`,
        ).pipe(
          HttpClientRequest.bearerToken(target.token),
          HttpClientRequest.acceptJson,
          HttpClientRequest.bodyJsonUnsafe({
            hash_algo: "sha256",
            objects: [{ oid, size: bytesOf(bytes) }],
            operation: "upload",
            transfers: ["basic"],
          }),
          http.execute,
          Effect.flatMap(HttpClientResponse.schemaBodyJson(Schema.Struct({
            objects: Schema.Array(Schema.Struct({
              actions: Schema.optional(Schema.Struct({
                upload: Schema.optional(Schema.Struct({
                  header: Schema.optional(Schema.Record(Schema.String, Schema.String)),
                  href: Schema.String,
                })),
              })),
            })),
          }))),
          Effect.mapError(() => new StorageError({ message: "Hugging Face LFS upload failed" })),
        )
        const upload = batch.objects[0]?.actions?.upload
        if (upload !== undefined) {
          yield* HttpClientRequest.put(upload.href).pipe(
            HttpClientRequest.setHeaders(upload.header ?? {}),
            HttpClientRequest.bodyUint8Array(bytes),
            http.execute,
            Effect.mapError(() => new StorageError({ message: "Hugging Face LFS transfer failed" })),
          )
        }
        yield* commit([
          { key: "header", value: { description: "", summary: "upload" } },
          { key: "lfsFile", value: { algo: "sha256", oid, path: key, size: bytesOf(bytes) } },
        ])
      })

      const lfsBatch = Schema.Struct({
        objects: Schema.Array(Schema.Struct({
          actions: Schema.optional(Schema.Struct({
            upload: Schema.optional(Schema.Struct({
              header: Schema.optional(Schema.Record(Schema.String, Schema.Union([Schema.String, Schema.Number]))),
              href: Schema.String,
            })),
          })),
          error: Schema.optional(Schema.Struct({
            message: Schema.optional(Schema.String),
          })),
        })),
      })

      const rejection = Schema.Struct({
        error: Schema.optional(Schema.String),
        message: Schema.optional(Schema.String),
      })

      // Reads a failed Hub response so a size rejection reaches the notice instead of a generic failure.
      const rejected = Effect.fn("HuggingFace.rejected")(function*(response: HttpClientResponse.HttpClientResponse) {
        const text = yield* response.text.pipe(Effect.orElseSucceed(() => ""))
        const parsed = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(rejection))(text).pipe(
          Effect.orElseSucceed(() => ({ error: undefined, message: undefined })),
        )
        const detail = parsed.message ?? parsed.error
        return yield* new StorageError({
          message: detail !== undefined && detail !== ""
            ? detail
            : `Hugging Face rejected this file (${response.status})`,
        })
      })

      // Hashes the file in chunks so the LFS oid does not require the whole body in memory.
      const hashFile = Effect.fn("HuggingFace.hashFile")(function*(path: string) {
        return yield* Effect.scoped(Effect.gen(function*() {
          const file = yield* fs.open(path).pipe(
            Effect.mapError(() => new StorageError({ message: "Could not read the uploaded temporary file" })),
          )
          const hash = createHash("sha256")
          const buffer = new Uint8Array(1024 * 1024)
          let position = 0n
          while (true) {
            const count = yield* file.read(buffer, { position }).pipe(
              Effect.mapError(() => new StorageError({ message: "Could not read the uploaded temporary file" })),
            )
            if (count === 0) {
              break
            }
            hash.update(buffer.subarray(0, count))
            position += BigInt(count)
          }
          return hash.digest("hex")
        }))
      })

      // Sends one byte range as the body of a request without reading the rest of the file.
      const putRange = Effect.fn("HuggingFace.putRange")(function*(
        href: string,
        path: string,
        offset: number,
        length: number | undefined,
      ) {
        const request = yield* HttpClientRequest.put(href).pipe(
          HttpClientRequest.bodyFile(path, {
            ...(length === undefined ? {} : { bytesToRead: ByteSize.bytes(length) }),
            ...(offset === 0 ? {} : { offset: ByteSize.bytes(offset) }),
          }),
          Effect.mapError(() => new StorageError({ message: "Hugging Face LFS transfer failed" })),
          Effect.provideService(FileSystem.FileSystem, fs),
        )
        const response = yield* raw.execute(request).pipe(
          Effect.mapError(() => new StorageError({ message: "Hugging Face LFS transfer failed" })),
        )
        if (response.status < 200 || response.status >= 300) {
          return yield* rejected(response)
        }
        return response
      })

      // Uploads from disk. Small files stay on the inline commit path; larger files use chunked LFS.
      const putFile = Effect.fn("HuggingFace.putFile")(function*(key: string, path: string, size: number) {
        if (size <= 8 * 1024 * 1024) {
          const bytes = yield* fs.readFile(path).pipe(
            Effect.mapError(() => new StorageError({ message: "Could not read the uploaded temporary file" })),
          )
          yield* put(key, bytes)
          return
        }
        const target = targetFor("")
        if (target === undefined) {
          return yield* unavailable("huggingface")
        }
        const oid = yield* hashFile(path)
        const response = yield* HttpClientRequest.post(
          `https://huggingface.co/datasets/${target.repo}.git/info/lfs/objects/batch`,
        ).pipe(
          HttpClientRequest.bearerToken(target.token),
          HttpClientRequest.acceptJson,
          HttpClientRequest.bodyJsonUnsafe({
            hash_algo: "sha256",
            objects: [{ oid, size }],
            operation: "upload",
            transfers: ["basic", "multipart"],
          }),
          raw.execute,
          Effect.mapError(() => new StorageError({ message: "Hugging Face LFS upload failed" })),
        )
        if (response.status < 200 || response.status >= 300) {
          return yield* rejected(response)
        }
        const batch = yield* HttpClientResponse.schemaBodyJson(lfsBatch)(response).pipe(
          Effect.mapError(() => new StorageError({ message: "Hugging Face LFS upload failed" })),
        )
        const object = batch.objects[0]
        if (object === undefined) {
          return yield* new StorageError({ message: "Hugging Face LFS upload failed" })
        }
        if (object.error !== undefined) {
          const message = object.error.message
          return yield* new StorageError({
            message: message !== undefined && message !== "" ? message : "Hugging Face rejected this file",
          })
        }
        const upload = object.actions?.upload
        if (upload !== undefined) {
          const header = upload.header ?? {}
          const chunkRaw = header["chunk_size"]
          if (chunkRaw !== undefined) {
            const chunkSize = typeof chunkRaw === "number" ? chunkRaw : Number(chunkRaw)
            const plan = uploadParts(size, chunkSize)
            const urls = new Map<number, string>()
            for (const [name, value] of Object.entries(header)) {
              if (!/^[0-9]+$/.test(name) || typeof value !== "string" || value === "") {
                continue
              }
              urls.set(Number(name), value)
            }
            if (!Number.isInteger(chunkSize) || chunkSize <= 0 || urls.size !== plan.length || plan.length === 0) {
              return yield* new StorageError({ message: "Hugging Face returned an unexpected upload plan" })
            }
            const parts: Array<{ readonly etag: string; readonly partNumber: number }> = []
            for (const part of plan) {
              const href = urls.get(part.number)
              if (href === undefined) {
                return yield* new StorageError({ message: "Hugging Face returned an unexpected upload plan" })
              }
              const uploaded = yield* putRange(href, path, part.offset, part.length)
              const etag = uploaded.headers["etag"]
              if (etag === undefined || etag === "") {
                return yield* new StorageError({ message: "Hugging Face did not return a part id" })
              }
              parts.push({ etag, partNumber: part.number })
            }
            const completed = yield* HttpClientRequest.post(upload.href).pipe(
              HttpClientRequest.bodyJsonUnsafe({ oid, parts }),
              HttpClientRequest.setHeader("accept", "application/vnd.git-lfs+json"),
              HttpClientRequest.setHeader("content-type", "application/vnd.git-lfs+json"),
              raw.execute,
              Effect.mapError(() => new StorageError({ message: "Hugging Face LFS transfer failed" })),
            )
            if (completed.status < 200 || completed.status >= 300) {
              return yield* rejected(completed)
            }
          } else {
            const stringHeaders: Record<string, string> = {}
            for (const [name, value] of Object.entries(header)) {
              if (typeof value === "string") {
                stringHeaders[name] = value
              }
            }
            const request = yield* HttpClientRequest.put(upload.href).pipe(
              HttpClientRequest.setHeaders(stringHeaders),
              HttpClientRequest.bodyFile(path),
              Effect.mapError(() => new StorageError({ message: "Hugging Face LFS transfer failed" })),
              Effect.provideService(FileSystem.FileSystem, fs),
            )
            const transferred = yield* raw.execute(request).pipe(
              Effect.mapError(() => new StorageError({ message: "Hugging Face LFS transfer failed" })),
            )
            if (transferred.status < 200 || transferred.status >= 300) {
              return yield* rejected(transferred)
            }
          }
        }
        yield* commit([
          { key: "header", value: { description: "", summary: "upload" } },
          { key: "lfsFile", value: { algo: "sha256", oid, path: key, size } },
        ])
      })

      const TreeItem = Schema.Struct({
        path: Schema.String,
        size: Schema.optional(Schema.Number),
        type: Schema.String,
      })

      // The dataset tree uses a Link header when the folder continues on another page.
      const nextTreePage = (link: string | undefined): string | undefined => {
        if (link === undefined) {
          return undefined
        }
        for (const part of link.split(",")) {
          const match = /<([^>]+)>\s*;\s*rel="?next"?/i.exec(part)
          const url = match?.[1]
          if (url !== undefined) {
            return url
          }
        }
        return undefined
      }

      // Lists a dataset tree and treats a missing path as an empty folder rather than a hard failure.
      const list = Effect.fn("HuggingFace.list")(function*(folder: string, recursive: boolean) {
        const encoded = folder.split("/").filter((part) => part !== "").map(encodeURIComponent).join("/")
        const target = targetFor(encoded === "" ? "/tree/main" : `/tree/main/${encoded}`)
        if (target === undefined) {
          return yield* unavailable("huggingface")
        }
        const files: Array<RemoteFile> = []
        const folders: Array<string> = []
        let url: string | undefined = `${target.url}${recursive ? "?recursive=true" : ""}`
        let truncated = false
        while (url !== undefined) {
          const pageUrl: string = url
          const response = yield* HttpClientRequest.get(pageUrl).pipe(
            HttpClientRequest.bearerToken(target.token),
            HttpClientRequest.acceptJson,
            raw.execute,
            Effect.mapError(() => new StorageError({ message: "Hugging Face list failed" })),
          )
          if (response.status === 404) {
            return { files: [], folders: [], truncated: false }
          }
          if (response.status < 200 || response.status >= 300) {
            return yield* new StorageError({ message: `Hugging Face list failed (${response.status})` })
          }
          const items = yield* HttpClientResponse.schemaBodyJson(Schema.Array(TreeItem))(response).pipe(
            Effect.mapError(() => new StorageError({ message: "Could not parse the Hugging Face list" })),
          )
          for (const item of items) {
            if (item.type === "directory") {
              folders.push(item.path)
              continue
            }
            if (item.type === "file") {
              const parts = yield* splitStorageKey(item.path)
              files.push({
                contentType: yield* contentTypeFromName(parts.name),
                key: item.path,
                size: Math.trunc(item.size ?? 0),
              })
            }
          }
          const link = Option.getOrUndefined(Headers.get(response.headers, "link"))
          const next = nextTreePage(link)
          if (next === undefined) {
            url = undefined
          } else if (next === pageUrl) {
            truncated = true
            url = undefined
          } else {
            url = next
          }
        }
        return { files, folders, truncated }
      })

      // Opens a dataset file as a byte stream so a download does not hold the whole file in memory.
      const open = Effect.fn("HuggingFace.open")(function*(key: string) {
        const target = targetFor("")
        if (target === undefined) {
          return yield* unavailable("huggingface")
        }
        const encoded = key.split("/").map(encodeURIComponent).join("/")
        const response = yield* HttpClientRequest.get(
          `https://huggingface.co/datasets/${target.repo}/resolve/main/${encoded}`,
        ).pipe(
          HttpClientRequest.bearerToken(target.token),
          http.execute,
          Effect.mapError(() => new StorageError({ message: "Hugging Face download failed" })),
        )
        return response.stream.pipe(
          Stream.mapError(() => new StorageError({ message: "Hugging Face download failed" })),
        )
      })

      // Downloads a dataset file by its storage key for moves between folders.
      const get = Effect.fn("HuggingFace.get")(function*(key: string) {
        const target = targetFor("")
        if (target === undefined) {
          return yield* unavailable("huggingface")
        }
        const encoded = key.split("/").map(encodeURIComponent).join("/")
        const response = yield* HttpClientRequest.get(
          `https://huggingface.co/datasets/${target.repo}/resolve/main/${encoded}`,
        ).pipe(
          HttpClientRequest.bearerToken(target.token),
          http.execute,
          Effect.mapError(() => new StorageError({ message: "Hugging Face download failed" })),
        )
        const buffer = yield* response.arrayBuffer.pipe(
          Effect.mapError(() => new StorageError({ message: "Hugging Face download failed" })),
        )
        return new Uint8Array(buffer)
      })

      // Deletes a path with a commit so an empty folder marker or a moved file leaves the dataset.
      const remove = Effect.fn("HuggingFace.delete")(function*(key: string) {
        yield* commit([
          { key: "header", value: { description: "", summary: "delete" } },
          { key: "deletedFile", value: { path: key } },
        ])
      })

      // Reads the dataset metadata so the source list can show the repo when the token works.
      const status = Effect.fn("HuggingFace.status")(function*() {
        if (config.huggingface === undefined) {
          return "Not configured"
        }
        yield* HttpClientRequest.get(`https://huggingface.co/api/datasets/${config.huggingface.repo}`).pipe(
          HttpClientRequest.bearerToken(Redacted.value(config.huggingface.token)),
          http.execute,
          Effect.mapError(() => new StorageError({ message: "Hugging Face did not respond" })),
        )
        return `Connected ${config.huggingface.repo}`
      })

      return HuggingFace.of({
        configured: config.huggingface !== undefined,
        delete: remove,
        get,
        list,
        open,
        put,
        putFile,
        status,
      })
    }),
  )
}
