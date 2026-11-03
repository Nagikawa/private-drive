import { DateTime, Effect } from "effect"
import type { SourceId } from "@private-drive/domain"
import { CatalogData, StoredFile, StoredFolder } from "./schema.ts"

// Copies entries and folders into a new snapshot so a later edit cannot alias the previous index.
export const replaceCatalog = (
  catalog: CatalogData,
  entries: ReadonlyArray<StoredFile>,
  folders: ReadonlyArray<StoredFolder>,
): CatalogData =>
  new (catalog.constructor as typeof CatalogData)({ entries: [...entries], folders: [...folders], version: 1 })

// Appends one file record while leaving the folder list untouched.
export const addEntry = (catalog: CatalogData, entry: StoredFile): CatalogData =>
  replaceCatalog(catalog, [...catalog.entries, entry], catalog.folders)

// Records a folder path once so the tree can show folders that have no files yet.
export const rememberFolder = (
  folders: ReadonlyArray<StoredFolder>,
  source: SourceId,
  folderPath: string,
): Array<StoredFolder> => {
  if (folderPath === "" || folders.some((folder) => folder.source === source && folder.path === folderPath)) {
    return [...folders]
  }
  return [...folders, new StoredFolder({ path: folderPath, source })]
}

// Records every ancestor of a path so a nested upload still shows the folders above it.
export const rememberFolderTree = (
  folders: ReadonlyArray<StoredFolder>,
  source: SourceId,
  folderPath: string,
): Array<StoredFolder> => {
  const parts = folderPath.split("/").filter((part) => part !== "")
  let next = [...folders]
  for (let index = 1; index <= parts.length; index += 1) {
    next = rememberFolder(next, source, parts.slice(0, index).join("/"))
  }
  return next
}

// Stamps an index row with the current time so listings can show when a file was first seen.
export const createdAt = Effect.fn("Catalog.createdAt")(function*() {
  return DateTime.formatIso(yield* DateTime.now)
})
