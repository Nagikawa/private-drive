import { Effect, FileSystem } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { Api, StorageError, contentTypeFromName, type SourceId } from "@private-drive/domain"
import { Drive } from "../drive/drive.ts"

interface UploadBody {
  readonly file: { readonly contentType: string; readonly name: string; readonly path: string }
  readonly folder: string
  readonly source: SourceId
}

export const FilesHandlers = HttpApiBuilder.group(
  Api,
  "files",
  Effect.fn("FilesHandlers")(function*(handlers) {
    const drive = yield* Drive
    const fs = yield* FileSystem.FileSystem

    // Reads the temporary multipart file and hands the bytes to the drive, filling in a type from the name when the browser sent a generic one.
    const upload = Effect.fn("FilesHandlers.upload")(function*(payload: UploadBody) {
      const bytes = yield* fs.readFile(payload.file.path).pipe(
        Effect.mapError(() => new StorageError({ message: "Could not read the uploaded temporary file" })),
      )
      const contentType = payload.file.contentType === "" || payload.file.contentType === "application/octet-stream"
        ? yield* contentTypeFromName(payload.file.name)
        : payload.file.contentType
      return yield* drive.upload({
        bytes,
        contentType,
        folder: payload.folder,
        name: payload.file.name,
        source: payload.source,
      })
    })

    return handlers.handleAll({
      // Creates a folder on the source the client selected.
      createFolder: ({ payload }) => drive.createFolder(payload.source, payload.path),
      // Deletes an empty folder and answers 404 when the index has never seen it.
      deleteFolder: ({ payload }) => drive.deleteFolder(payload.source, payload.path),
      // Lists one folder, optionally searching or walking the whole tree for the sidebar.
      list: ({ query }) =>
        drive.list({
          folder: query.folder ?? "",
          kind: query.kind ?? "all",
          recursive: query.recursive === "true",
          search: query.search ?? "",
          source: query.source,
        }),
      // Moves the selected ids into another folder on the same source.
      move: ({ payload }) => drive.move(payload.ids, payload.folder),
      // Deletes the selected file ids from their stores and the index.
      remove: ({ payload }) => drive.remove(payload.ids),
      // Reports which storage providers are configured and reachable.
      sources: () => drive.sources(),
      upload: ({ payload }) => upload(payload),
      // Stores a file fetched from a public URL.
      uploadUrl: ({ payload }) => drive.uploadUrl(payload.source, payload.folder, payload.url),
    })
  }),
)
