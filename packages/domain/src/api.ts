import { HttpApi, HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/http-api"
import { Multipart } from "effect/http"
import { Schema } from "effect"
import {
  Account,
  CompleteUpload,
  OpenUpload,
  DeletePayload,
  DeleteResult,
  FileEntry,
  MovePayload,
  MoveResult,
  RenamePayload,
  ShareLink,
  SharePayload,
  FolderEntry,
  FolderPayload,
  Listing,
  LoginPayload,
  NotFound,
  SourceId,
  SourceStatus,
  StorageError,
  Unauthorized,
  UploadProgress,
  UrlUploadPayload,
} from "./model.ts"
import { Session } from "./session.ts"

const UploadPayload = Schema.Struct({
  file: Multipart.SingleFileSchema,
  folder: Schema.String,
  source: SourceId,
// No parser cap. Telegram still refuses a document above 50 MB, and the other stores stream the file.
}).pipe(HttpApiSchema.asMultipart())

export class SessionApi extends HttpApiGroup.make("session")
  .add(
    HttpApiEndpoint.post("logout", "/logout", {
      success: HttpApiSchema.NoContent,
    }),
    HttpApiEndpoint.get("current", "/current", {
      success: Account,
    }),
  )
  .middleware(Session)
  .add(
    HttpApiEndpoint.post("login", "/login", {
      error: Unauthorized,
      payload: LoginPayload,
      success: Account,
    }),
  )
  .prefix("/api/session")
{}

export class FilesApi extends HttpApiGroup.make("files")
  .add(
    HttpApiEndpoint.get("sources", "/sources", {
      success: Schema.Array(SourceStatus),
    }),
    HttpApiEndpoint.get("list", "/files", {
      error: StorageError,
      query: {
        cursor: Schema.optional(Schema.String),
        folder: Schema.optional(Schema.String),
        kind: Schema.optional(Schema.Literals(["all", "image"])),
        order: Schema.optional(Schema.Literals(["asc", "desc"])),
        recursive: Schema.optional(Schema.Literals(["true", "false"])),
        search: Schema.optional(Schema.String),
        sort: Schema.optional(Schema.Literals(["name", "size", "created", "type"])),
        source: SourceId,
      },
      success: Listing,
    }),
    HttpApiEndpoint.post("createFolder", "/folders", {
      error: StorageError,
      payload: FolderPayload,
      success: FolderEntry,
    }),
    HttpApiEndpoint.post("deleteFolder", "/folders/delete", {
      error: [NotFound, StorageError],
      payload: FolderPayload,
      success: HttpApiSchema.NoContent,
    }),
    HttpApiEndpoint.post("upload", "/uploads", {
      error: StorageError,
      payload: UploadPayload,
      success: FileEntry,
    }),
    HttpApiEndpoint.post("uploadUrl", "/uploads/url", {
      error: StorageError,
      payload: UrlUploadPayload,
      success: FileEntry,
    }),
    HttpApiEndpoint.post("remove", "/files/delete", {
      error: StorageError,
      payload: DeletePayload,
      success: DeleteResult,
    }),
    HttpApiEndpoint.post("move", "/files/move", {
      error: StorageError,
      payload: MovePayload,
      success: MoveResult,
    }),
    HttpApiEndpoint.post("rename", "/files/rename", {
      error: StorageError,
      payload: RenamePayload,
      success: FileEntry,
    }),
    HttpApiEndpoint.post("openUpload", "/uploads/sessions", {
      error: StorageError,
      payload: OpenUpload,
      success: UploadProgress,
    }),
    HttpApiEndpoint.get("uploadSessions", "/uploads/sessions", {
      error: StorageError,
      query: {
        folder: Schema.optional(Schema.String),
        source: SourceId,
      },
      success: Schema.Array(UploadProgress),
    }),
    HttpApiEndpoint.post("completeUpload", "/uploads/sessions/complete", {
      error: StorageError,
      payload: CompleteUpload,
      success: FileEntry,
    }),
    HttpApiEndpoint.post("share", "/files/share", {
      error: [NotFound, StorageError],
      payload: SharePayload,
      success: ShareLink,
    }),
  )
  .middleware(Session)
  .prefix("/api")
{}

export class Api extends HttpApi.make("private-drive").add(SessionApi).add(FilesApi) {}
