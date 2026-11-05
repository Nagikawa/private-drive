import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { reconcileRemote } from "../src/drive/reconcile.ts"
import { CatalogData, StoredFile } from "../src/index/schema.ts"

const kept = new StoredFile({
  contentType: "text/plain",
  createdAt: "2026-01-01T00:00:00.000Z",
  folder: "img",
  id: "kept",
  name: "kept.txt",
  size: 1,
  source: "r2",
  storageKey: "img/kept.txt",
})

const current = new CatalogData({ entries: [kept], folders: [], version: 1 })

describe("reconcileRemote", () => {
  // Telegram cannot list history, so an empty remote page must not delete the index.
  it.effect("leaves the index alone when the provider cannot list", () =>
    Effect.sync(() => {
      const next = reconcileRemote({
        current,
        folder: "img",
        listsRemotely: false,
        recursive: false,
        remote: { files: [], folders: [], truncated: false },
        source: "r2",
        stamp: "2026-01-02T00:00:00.000Z",
      })
      expect(next.entries.map((entry) => entry.id)).toEqual(["kept"])
    }),
  )

  // A page that says it continued must not delete rows it never returned.
  it.effect("keeps unseen rows when the remote page is truncated", () =>
    Effect.sync(() => {
      const next = reconcileRemote({
        current,
        folder: "img",
        listsRemotely: true,
        recursive: false,
        remote: {
          files: [{ contentType: "text/plain", key: "img/new.txt", size: 2 }],
          folders: ["img/scene"],
          truncated: true,
        },
        source: "r2",
        stamp: "2026-01-02T00:00:00.000Z",
      })
      expect(next.entries.map((entry) => entry.name).sort()).toEqual(["kept.txt", "new.txt"])
      expect(next.folders.map((folder) => folder.path)).toEqual(["img/scene"])
    }),
  )

  // A finished listing drops a file the store no longer has, and ignores the folder marker.
  it.effect("drops a missing file and skips the keep marker", () =>
    Effect.sync(() => {
      const next = reconcileRemote({
        current,
        folder: "img",
        listsRemotely: true,
        recursive: false,
        remote: {
          files: [{ contentType: "application/octet-stream", key: "img/.keep", size: 0 }],
          folders: [],
          truncated: false,
        },
        source: "r2",
        stamp: "2026-01-02T00:00:00.000Z",
      })
      expect(next.entries).toEqual([])
    }),
  )
})
