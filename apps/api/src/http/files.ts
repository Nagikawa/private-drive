import { ByteSize, Effect, FileSystem, Option } from "effect"
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

    // Stats the temporary multipart file and passes its path through, so a large body is streamed from disk.
    const upload = Effect.fn("FilesHandlers.upload")(function*(payload: UploadBody) {
      const info = yield* fs.stat(payload.file.path).pipe(
        Effect.mapError(() => new StorageError({ message: "Could not read the uploaded temporary file" })),
      )
      const size = yield* Option.match(ByteSize.toNumber(info.size), {
        onNone: () => Effect.fail(new StorageError({ message: "The uploaded file is too large to index" })),
        onSome: Effect.succeed,
      })
      const contentType = payload.file.contentType === "" || payload.file.contentType === "application/octet-stream"
        ? yield* contentTypeFromName(payload.file.name)
        : payload.file.contentType
      return yield* drive.upload({
        contentType,
        folder: payload.folder,
        name: payload.file.name,
        path: payload.file.path,
        size,
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
          ...(query.cursor === undefined || query.cursor === "" ? {} : { cursor: query.cursor }),
          folder: query.folder ?? "",
          kind: query.kind ?? "all",
          order: query.order ?? "asc",
          recursive: query.recursive === "true",
          search: query.search ?? "",
          sort: query.sort ?? "name",
          source: query.source,
        }),
      // Moves the selected ids into another folder on the same source.
      move: ({ payload }) => drive.move(payload.ids, payload.folder),
      // Renames one file and keeps the stored extension even if the request names another type.
      rename: ({ payload }) => drive.rename(payload.id, payload.name),
      // Signs a short-lived content URL for a file that is already in the index.
      share: ({ payload }) => drive.share(payload.id),
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
