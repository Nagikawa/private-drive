import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { NodeFileSystem, NodePath } from "@effect/platform-node"
import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { Catalog } from "../src/index/catalog.ts"
import { StoredFile } from "../src/index/schema.ts"
import { addEntry, replaceCatalog } from "../src/index/update.ts"
import { configFor, tempDirectory } from "./support.ts"

const sample = new StoredFile({
  contentType: "text/plain",
  createdAt: "2026-01-01T00:00:00.000Z",
  folder: "",
  id: "file-1",
  name: "a.txt",
  size: 4,
  source: "r2",
  storageKey: "a.txt",
})

describe("Catalog", () => {
  // A second write keeps the previous JSON beside the new one, and a later read sees the new row.
  it.effect("writes the index and keeps a backup of the previous file", () =>
    Effect.gen(function*() {
      const directory = yield* tempDirectory
      const indexPath = join(directory, "index.json")
      const catalog = yield* Effect.gen(function*() {
        return yield* Catalog
      }).pipe(
        Effect.provide(Catalog.layer),
        Effect.provide(NodeFileSystem.layer),
        Effect.provide(NodePath.layer),
        Effect.provide(configFor(indexPath)),
      )
      const added = yield* catalog.modify((current) => {
        const next = addEntry(current, sample)
        return [next, next.entries.length] as const
      })
      expect(added).toBe(1)
      const renamed = yield* catalog.modify((current) => {
        const entries = current.entries.map((entry) =>
          new StoredFile({
            contentType: entry.contentType,
            createdAt: entry.createdAt,
            folder: entry.folder,
            id: entry.id,
            name: "b.txt",
            size: entry.size,
            source: entry.source,
            storageKey: entry.storageKey,
          })
        )
        return [replaceCatalog(current, entries, current.folders), entries[0]?.name] as const
      })
      expect(renamed).toBe("b.txt")
      const read = yield* catalog.read
      expect(read.entries.map((entry) => entry.name)).toEqual(["b.txt"])
      const backup = yield* Effect.tryPromise({
        try: () => readFile(`${indexPath}.bak`, "utf8"),
        catch: () => new Error("Could not read the index backup"),
      })
      expect(backup).toContain("a.txt")
    }))
})
