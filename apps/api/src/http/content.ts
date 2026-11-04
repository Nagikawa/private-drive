import { DateTime, Effect, Redacted } from "effect"
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http"
import { NotFound, StorageError } from "@private-drive/domain"
import { SessionLedger } from "../auth/ledger.ts"
import { contentSignatureValid } from "../auth/share.ts"
import { AppConfig } from "../config.ts"
import { Drive } from "../drive/drive.ts"

// Serves file bytes outside the JSON API so the browser can preview images and media with a normal URL.
const serveContent = Effect.fn("serveContent")(function*() {
  const request = yield* HttpServerRequest.HttpServerRequest
  const config = yield* AppConfig
  const ledger = yield* SessionLedger
  const params = yield* HttpRouter.params
  const now = DateTime.toEpochMillis(yield* DateTime.now)
  const id = params["id"]
  const query = new URL(request.url, "http://127.0.0.1").searchParams
  const signed = id !== undefined && contentSignatureValid(
    Redacted.value(config.sessionSecret),
    id,
    query.get("exp") ?? "",
    query.get("sig") ?? "",
    now,
  )
  const accepted = signed || (yield* ledger.accept(request.cookies["session"] ?? "", now))
  if (!accepted) {
    return HttpServerResponse.text("Log in first", { status: 401 })
  }
  if (id === undefined) {
    return HttpServerResponse.text("File not found", { status: 404 })
  }
  const drive = yield* Drive
  const file = yield* drive.read(id).pipe(
    Effect.catchTag("NotFound", () => Effect.succeed(new NotFound({ message: "File not found" }))),
    Effect.catchTag("StorageError", (error) => Effect.succeed(error)),
  )
  if (file instanceof NotFound) {
    return HttpServerResponse.text(file.message, { status: 404 })
  }
  if (file instanceof StorageError) {
    return HttpServerResponse.text(file.message, { status: 400 })
  }
  const download = new URL(request.url, "http://127.0.0.1").searchParams.get("download") === "1"
  const disposition = download ? "attachment" : "inline"
  return HttpServerResponse.stream(file.body, {
    contentType: file.contentType,
    ...(file.size > 0 ? { contentLength: file.size } : {}),
    headers: {
      "cache-control": "private, max-age=60",
      "content-disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(file.name)}`,
    },
  })
})

export const ContentRoute = HttpRouter.add("GET", "/api/files/:id/content", serveContent())
