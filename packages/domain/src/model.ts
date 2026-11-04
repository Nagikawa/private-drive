import { Context, Schema } from "effect"

export const SourceId = Schema.Literals(["r2", "telegram", "huggingface"])
export type SourceId = typeof SourceId.Type

// Marks a signed-in session. The cookie is the credential; this body has no identity fields.
export class Account extends Schema.Class<Account>("private-drive/Account")({}) {}

export class CurrentAccount extends Context.Service<CurrentAccount, Account>()("private-drive/CurrentAccount") {}

export class Unauthorized extends Schema.TaggedError<Unauthorized>()("Unauthorized", {
  message: Schema.String,
}, { httpApiStatus: 401 }) {}

export class StorageError extends Schema.TaggedError<StorageError>()("StorageError", {
  message: Schema.String,
}, { httpApiStatus: 400 }) {}

export class NotFound extends Schema.TaggedError<NotFound>()("NotFound", {
  message: Schema.String,
}, { httpApiStatus: 404 }) {}

export class LoginPayload extends Schema.Class<LoginPayload>("private-drive/LoginPayload")({
  password: Schema.String,
}) {}

export class FileEntry extends Schema.Class<FileEntry>("private-drive/FileEntry")({
  id: Schema.String,
  source: SourceId,
  name: Schema.String,
  folder: Schema.String,
  size: Schema.Int,
  contentType: Schema.String,
  createdAt: Schema.String,
  image: Schema.Boolean,
}) {}

export class FolderEntry extends Schema.Class<FolderEntry>("private-drive/FolderEntry")({
  name: Schema.String,
  path: Schema.String,
}) {}

export class Listing extends Schema.Class<Listing>("private-drive/Listing")({
  source: SourceId,
  folder: Schema.String,
  folders: Schema.Array(FolderEntry),
  files: Schema.Array(FileEntry),
  truncated: Schema.Boolean,
}) {}

export class SourceStatus extends Schema.Class<SourceStatus>("private-drive/SourceStatus")({
  id: SourceId,
  label: Schema.String,
  connected: Schema.Boolean,
  detail: Schema.String,
}) {}

export class FolderPayload extends Schema.Class<FolderPayload>("private-drive/FolderPayload")({
  source: SourceId,
  path: Schema.String,
}) {}

export class UrlUploadPayload extends Schema.Class<UrlUploadPayload>("private-drive/UrlUploadPayload")({
  source: SourceId,
  folder: Schema.String,
  url: Schema.String,
}) {}

export class DeletePayload extends Schema.Class<DeletePayload>("private-drive/DeletePayload")({
  ids: Schema.Array(Schema.String),
}) {}

export class DeleteResult extends Schema.Class<DeleteResult>("private-drive/DeleteResult")({
  removed: Schema.Int,
}) {}

export class MovePayload extends Schema.Class<MovePayload>("private-drive/MovePayload")({
  folder: Schema.String,
  ids: Schema.Array(Schema.String),
}) {}

export class MoveResult extends Schema.Class<MoveResult>("private-drive/MoveResult")({
  moved: Schema.Int,
}) {}

export class RenamePayload extends Schema.Class<RenamePayload>("private-drive/RenamePayload")({
  id: Schema.String,
  name: Schema.String,
}) {}
