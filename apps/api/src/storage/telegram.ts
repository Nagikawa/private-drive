import { openAsBlob } from "node:fs"
import { Context, Effect, Layer, Redacted, Schema, Stream } from "effect"
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http"
import { StorageError, splitStorageKey } from "@private-drive/domain"
import { AppConfig } from "../config.ts"
import { unavailable } from "./shared.ts"

export interface TelegramStored {
  readonly messageId: number | undefined
  readonly storageKey: string
}

const FileInfo = Schema.Struct({
  description: Schema.optional(Schema.String),
  ok: Schema.Boolean,
  result: Schema.optional(Schema.Struct({ file_path: Schema.optional(Schema.String) })),
})

// Cloud getFile refuses documents above about 20 MB with "file is too big".
const lookupError = (description: string | undefined): StorageError =>
  description !== undefined && description.toLowerCase().includes("file is too big")
    ? new StorageError({ message: "Telegram cloud downloads stop at 20 MB, so this file cannot be opened" })
    : new StorageError({ message: "Telegram file not found" })

export class Telegram extends Context.Service<Telegram, {
  readonly configured: boolean
  deleteMessage(messageId: number): Effect.Effect<void, StorageError>
  get(fileId: string): Effect.Effect<Uint8Array, StorageError>
  open(fileId: string): Effect.Effect<Stream.Stream<Uint8Array, StorageError>, StorageError>
  put(key: string, path: string, contentType: string): Effect.Effect<TelegramStored, StorageError>
  status(): Effect.Effect<string, StorageError>
}>()("private-drive/api/storage/Telegram") {
  // Talks to the bot API with the configured token, and fails closed when the bot is unset.
  static readonly layer = Layer.effect(
    Telegram,
    Effect.gen(function*() {
      const config = yield* AppConfig
      const raw = yield* HttpClient.HttpClient
      const http = raw.pipe(HttpClient.filterStatusOk)

      // Calls a bot method and decodes the JSON body into an unknown value the caller parses.
      const call = Effect.fn("Telegram.call")(function*(init: HttpClientRequest.HttpClientRequest) {
        if (config.telegram === undefined) {
          return yield* unavailable("telegram")
        }
        const token = Redacted.value(config.telegram.token)
        return yield* init.pipe(
          HttpClientRequest.prependUrl(`https://api.telegram.org/bot${token}`),
          http.execute,
          Effect.flatMap(HttpClientResponse.schemaBodyJson(Schema.Unknown)),
          Effect.mapError(() => new StorageError({ message: "Telegram request failed" })),
        )
      })

      // Uploads a document from disk and keeps Telegram's file id, because the chat is the actual store.
      const put = Effect.fn("Telegram.put")(function*(key: string, path: string, contentType: string) {
        if (config.telegram === undefined) {
          return yield* unavailable("telegram")
        }
        const form = new FormData()
        form.set("chat_id", config.telegram.chatId)
        const name = (yield* splitStorageKey(key)).name
        const blob = yield* Effect.tryPromise({
          catch: () => new StorageError({ message: "Could not read the uploaded temporary file" }),
          try: () => openAsBlob(path, { type: contentType }),
        })
        form.set("document", blob, name)
        const result = yield* HttpClientRequest.post("/sendDocument").pipe(
          HttpClientRequest.bodyFormData(form),
          call,
        )
        const parsed = yield* Schema.decodeUnknownEffect(Schema.Struct({
          ok: Schema.Boolean,
          result: Schema.optional(Schema.Struct({
            document: Schema.optional(Schema.Struct({ file_id: Schema.String })),
            message_id: Schema.optional(Schema.Number),
          })),
        }))(result).pipe(
          Effect.mapError(() => new StorageError({ message: "Could not parse the Telegram upload response" })),
        )
        const fileId = parsed.result?.document?.file_id
        if (!parsed.ok || fileId === undefined) {
          return yield* new StorageError({ message: "Telegram did not accept this file" })
        }
        return {
          messageId: parsed.result?.message_id,
          storageKey: fileId,
        }
      })

      // Resolves a file id. A 400 from getFile still has a description, so an oversized file is not reported as missing.
      const resolvePath = Effect.fn("Telegram.resolvePath")(function*(fileId: string) {
        if (config.telegram === undefined) {
          return yield* unavailable("telegram")
        }
        const token = Redacted.value(config.telegram.token)
        const info = yield* HttpClientRequest.get(
          `https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`,
        ).pipe(
          raw.execute,
          Effect.flatMap(HttpClientResponse.schemaBodyJson(FileInfo)),
          Effect.mapError(() => new StorageError({ message: "Telegram file lookup failed" })),
        )
        const path = info.result?.file_path
        if (!info.ok || path === undefined) {
          return yield* lookupError(info.description)
        }
        return path
      })

      // Opens a bot file as a byte stream so a download does not hold the whole file in memory.
      const open = Effect.fn("Telegram.open")(function*(fileId: string) {
        if (config.telegram === undefined) {
          return yield* unavailable("telegram")
        }
        const token = Redacted.value(config.telegram.token)
        const filePath = yield* resolvePath(fileId)
        const response = yield* HttpClientRequest.get(
          `https://api.telegram.org/file/bot${token}/${filePath}`,
        ).pipe(
          http.execute,
          Effect.mapError(() => new StorageError({ message: "Telegram download failed" })),
        )
        return response.stream.pipe(
          Stream.mapError(() => new StorageError({ message: "Telegram download failed" })),
        )
      })

      // Resolves a file id to bytes for callers that still need the whole document.
      const get = Effect.fn("Telegram.get")(function*(fileId: string) {
        if (config.telegram === undefined) {
          return yield* unavailable("telegram")
        }
        const token = Redacted.value(config.telegram.token)
        const filePath = yield* resolvePath(fileId)
        const response = yield* HttpClientRequest.get(
          `https://api.telegram.org/file/bot${token}/${filePath}`,
        ).pipe(
          http.execute,
          Effect.mapError(() => new StorageError({ message: "Telegram download failed" })),
        )
        const buffer = yield* response.arrayBuffer.pipe(
          Effect.mapError(() => new StorageError({ message: "Telegram download failed" })),
        )
        return new Uint8Array(buffer)
      })

      // Asks Telegram to drop the chat message, and ignores a miss so the index row can still be removed.
      const deleteMessage = Effect.fn("Telegram.deleteMessage")(function*(messageId: number) {
        if (config.telegram === undefined) {
          return yield* unavailable("telegram")
        }
        const form = new FormData()
        form.set("chat_id", config.telegram.chatId)
        form.set("message_id", String(messageId))
        yield* HttpClientRequest.post("/deleteMessage").pipe(
          HttpClientRequest.bodyFormData(form),
          call,
          Effect.catch(() => Effect.void),
        )
      })

      // Asks getMe so the source list can show the bot handle when the token works.
      const status = Effect.fn("Telegram.status")(function*() {
        const result = yield* call(HttpClientRequest.get("/getMe"))
        const parsed = yield* Schema.decodeUnknownEffect(Schema.Struct({
          ok: Schema.Boolean,
          result: Schema.optional(Schema.Struct({ username: Schema.optional(Schema.String) })),
        }))(result).pipe(Effect.orElseSucceed(() => ({ ok: false, result: undefined })))
        return parsed.ok ? `Connected @${parsed.result?.username ?? "bot"}` : "Telegram did not respond"
      })

      return Telegram.of({
        configured: config.telegram !== undefined,
        deleteMessage,
        get,
        open,
        put,
        status,
      })
    }),
  )
}
