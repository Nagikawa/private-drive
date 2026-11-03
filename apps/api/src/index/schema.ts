import { Schema } from "effect"
import { SourceId } from "@private-drive/domain"

export class StoredFile extends Schema.Class<StoredFile>("private-drive/StoredFile")({
  contentType: Schema.String,
  createdAt: Schema.String,
  folder: Schema.String,
  id: Schema.String,
  name: Schema.String,
  size: Schema.Int,
  source: SourceId,
  storageKey: Schema.String,
  telegramMessageId: Schema.optional(Schema.Int),
}) {}

export class StoredFolder extends Schema.Class<StoredFolder>("private-drive/StoredFolder")({
  path: Schema.String,
  source: SourceId,
}) {}

export class CatalogData extends Schema.Class<CatalogData>("private-drive/CatalogData")({
  entries: Schema.Array(StoredFile),
  folders: Schema.Array(StoredFolder),
  version: Schema.Literal(1),
}) {}
