import { describe, expect, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { CatalogData, StoredFile, StoredFolder } from "../src/index/schema.ts"
import { addEntry, rememberFolder, rememberFolderTree, replaceCatalog } from "../src/index/update.ts"

const empty = new CatalogData({ entries: [], folders: [], version: 1 })

const file = new StoredFile({
  contentType: "text/plain",
  createdAt: "2026-01-01T00:00:00.000Z",
  folder: "img",
  id: "file-1",
  name: "a.txt",
  size: 1,
  source: "r2",
  storageKey: "img/a.txt",
})

describe("catalog updates", () => {
  // A nested upload still shows every folder above the file.
  it.effect("remembers a folder path and each ancestor once", () =>
    Effect.sync(() => {
      const once = rememberFolder([], "r2", "img")
      expect(rememberFolder(once, "r2", "img").map((folder) => folder.path)).toEqual(["img"])
      expect(rememberFolder(once, "r2", "").map((folder) => folder.path)).toEqual(["img"])
      const tree = rememberFolderTree([], "huggingface", "img/scene/hong")
      expect(tree.map((folder) => folder.path)).toEqual(["img", "img/scene", "img/scene/hong"])
    }))

  // The previous snapshot stays intact after a row is appended.
  it.effect("copies entries when a row is added", () =>
    Effect.sync(() => {
      const next = addEntry(empty, file)
      expect(empty.entries).toEqual([])
      expect(next.entries).toEqual([file])
      const replaced = replaceCatalog(next, [], [new StoredFolder({ path: "img", source: "r2" })])
      expect(next.folders).toEqual([])
      expect(replaced.folders.map((folder) => folder.path)).toEqual(["img"])
    }))

  // The on-disk document is version 1. Anything else is not an index.
  it.effect("rejects a catalog that is not version 1", () =>
    Effect.gen(function*() {
      const decoded = yield* Schema.decodeUnknownEffect(CatalogData)({ entries: [], folders: [], version: 1 }).pipe(
        Effect.result,
      )
      expect(decoded._tag).toBe("Success")
      const rejected = yield* Schema.decodeUnknownEffect(CatalogData)({ entries: [], folders: [], version: 2 }).pipe(
        Effect.result,
      )
      expect(rejected._tag).toBe("Failure")
    }))
})
