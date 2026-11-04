import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { forgetUpload, readPendingUploads, rememberUpload } from "../src/storage/r2-uploads.ts"

describe("R2 upload journal", () => {
  // A crash after CreateMultipartUpload leaves the id so the next boot can abort it.
  it.effect("remembers an upload and forgets it by id", () =>
    Effect.gen(function*() {
      const directory = yield* Effect.tryPromise({
        try: () => mkdtemp(join(tmpdir(), "private-drive-r2-")),
        catch: () => new Error("Could not create a temp directory"),
      })
      yield* Effect.addFinalizer(() =>
        Effect.tryPromise({
          try: () => rm(directory, { force: true, recursive: true }),
          catch: () => new Error("Could not remove the temp directory"),
        }).pipe(Effect.ignore)
      )
      const path = join(directory, "r2-uploads.json")
      expect(yield* Effect.tryPromise(() => readPendingUploads(path))).toEqual([])
      yield* Effect.tryPromise(() => rememberUpload(path, { key: "a", uploadId: "1" }))
      yield* Effect.tryPromise(() => rememberUpload(path, { key: "", uploadId: "skip" }))
      const remembered = yield* Effect.tryPromise(() => readPendingUploads(path))
      expect(remembered).toEqual([{ key: "a", uploadId: "1" }])
      yield* Effect.tryPromise(() => forgetUpload(path, "1"))
      expect(yield* Effect.tryPromise(() => readPendingUploads(path))).toEqual([])
    }))
})
