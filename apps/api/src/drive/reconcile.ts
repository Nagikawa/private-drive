import {
  isWithinFolder,
  pure,
  splitStorageKey,
  type SourceId,
} from "@private-drive/domain"
import { CatalogData, StoredFile } from "../index/schema.ts"
import { addEntry, rememberFolder, replaceCatalog } from "../index/update.ts"
import { keepName, type RemoteListing } from "../storage/shared.ts"

// Merges one remote page into the index.
// A provider that cannot list is left untouched. A truncated page must not delete rows it never saw.
export const reconcileRemote = (input: {
  readonly current: CatalogData
  readonly folder: string
  readonly listsRemotely: boolean
  readonly recursive: boolean
  readonly remote: RemoteListing
  readonly source: SourceId
  readonly stamp: string
}): CatalogData => {
  if (!input.listsRemotely) {
    return input.current
  }
  let next = input.current
  const remoteKeys = new Set(input.remote.files.map((file) => file.key))
  for (const file of input.remote.files) {
    const parts = pure(splitStorageKey(file.key), { folder: "", name: file.key })
    if (parts.name === keepName) {
      continue
    }
    if (!next.entries.some((entry) => entry.source === input.source && entry.storageKey === file.key)) {
      next = addEntry(next, new StoredFile({
        contentType: file.contentType,
        createdAt: input.stamp,
        folder: parts.folder,
        id: crypto.randomUUID(),
        name: parts.name,
        size: Math.trunc(file.size),
        source: input.source,
        storageKey: file.key,
      }))
    }
  }
  const inScope = (entry: StoredFile) =>
    entry.source === input.source &&
    (input.recursive ? pure(isWithinFolder(input.folder, entry.folder), false) : entry.folder === input.folder)
  const entries = input.remote.truncated
    ? next.entries
    : next.entries.filter((entry) => !inScope(entry) || remoteKeys.has(entry.storageKey))
  let folders = next.folders
  for (const path of input.remote.folders) {
    folders = rememberFolder(folders, input.source, path)
  }
  return replaceCatalog(next, entries, folders)
}
