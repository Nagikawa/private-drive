import { DateTime, Effect, Redacted } from "effect"
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http"
import { NotFound, StorageError } from "@private-drive/domain"
import { sessionValid } from "../auth/session.ts"
import { AppConfig } from "../config.ts"
import { Drive } from "../drive/drive.ts"

// Serves file bytes outside the JSON API so the browser can preview images and media with a normal URL.
const serveContent = Effect.fn("serveContent")(function*() {
  const config = yield* AppConfig
  const request = yield* HttpServerRequest.HttpServerRequest
  const params = yield* HttpRouter.params
  const now = DateTime.toEpochMillis(yield* DateTime.now)
  const token = request.cookies["session"] ?? ""
  if (!sessionValid(Redacted.value(config.sessionSecret), token, now)) {
    return HttpServerResponse.text("Log in first", { status: 401 })
  }
  const id = params["id"]
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
  return HttpServerResponse.uint8Array(file.bytes, {
    contentType: file.contentType,
    headers: {
      "cache-control": "private, max-age=60",
      "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(file.name)}`,
    },
  })
})

export const ContentRoute = HttpRouter.add("GET", "/api/files/:id/content", serveContent())
