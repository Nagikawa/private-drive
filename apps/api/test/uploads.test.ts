import { join } from "node:path"
import { NodeFileSystem, NodePath } from "@effect/platform-node"
import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer, Result } from "effect"
import { FileEntry, OpenUpload } from "@private-drive/domain"
import { Drive } from "../src/drive/drive.ts"
import { Uploads } from "../src/drive/uploads.ts"
import { configFor, tempDirectory } from "./support.ts"

const saved: Array<string> = []

const drive = {
  upload: (input: { readonly name: string }) => {
    saved.push(input.name)
    return Effect.succeed(
      new FileEntry({
        contentType: "text/plain",
        createdAt: "2026-01-01T00:00:00.000Z",
        folder: "",
        id: "stored",
        image: false,
        name: input.name,
        size: 3,
        source: "r2",
      }),
    )
  },
} as Drive["Service"]

describe("Uploads", () => {
  // The same file continues at the stored offset, and a mismatched start is refused.
  it.effect("reuses a session and writes the next bytes", () =>
    Effect.gen(function* () {
      saved.length = 0
      const directory = yield* tempDirectory
      const uploads = yield* Effect.gen(function* () {
        return yield* Uploads
      }).pipe(
        Effect.provide(Uploads.layer),
        Effect.provide(Layer.succeed(Drive, drive)),
        Effect.provide(NodeFileSystem.layer),
        Effect.provide(NodePath.layer),
        Effect.provide(configFor(join(directory, "index.json"))),
      )
      const opened = yield* uploads.open(
        OpenUpload.make({
          contentType: "",
          folder: "img",
          name: "a.txt",
          size: 3,
          source: "r2",
        }),
      )
      const again = yield* uploads.open(
        OpenUpload.make({
          contentType: "text/plain",
          folder: "img",
          name: "a.txt",
          size: 3,
          source: "r2",
        }),
      )
      expect(again.id).toBe(opened.id)
      const early = yield* uploads.append(opened.id, 2, new Uint8Array([1])).pipe(Effect.result)
      expect(Result.isFailure(early) && early.failure.message).toBe("Resume this upload at byte 0")
      const written = yield* uploads.append(opened.id, 0, new Uint8Array([1, 2, 3]))
      expect(written.offset).toBe(3)
      const finished = yield* uploads.complete(opened.id)
      expect(finished.id).toBe("stored")
      expect(saved).toEqual(["a.txt"])
      expect(yield* uploads.list("r2", "img")).toEqual([])
    }),
  )
})
