import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import { normalizeFolder, sanitizeFileName } from "../src/policy/paths.ts"

describe("normalizeFolder", () => {
  // Collapses slashes and trims a normal folder.
  it.effect("keeps a nested folder", () =>
    Effect.gen(function* () {
      const folder = yield* normalizeFolder(" /photos/trip/ ")
      expect(folder).toBe("photos/trip")
    }),
  )

  // An empty input is Root, which the drive stores as an empty path.
  it.effect("treats a blank path as Root", () =>
    Effect.gen(function* () {
      const folder = yield* normalizeFolder(" / ")
      expect(folder).toBe("")
    }),
  )

  // Parent segments are a tagged failure, not an exception.
  it.effect("rejects a path that leaves the drive", () =>
    Effect.gen(function* () {
      const message = yield* normalizeFolder("photos/../secret").pipe(
        Effect.match({
          onFailure: (error) => error.message,
          onSuccess: () => "",
        }),
      )
      expect(message).toBe("Invalid folder path")
    }),
  )
})

describe("sanitizeFileName", () => {
  // Drops the directory and keeps the final segment.
  it.effect("keeps the file name", () =>
    Effect.gen(function* () {
      const name = yield* sanitizeFileName("photos/cat.jpg")
      expect(name).toBe("cat.jpg")
    }),
  )

  // The folder marker is not a file the user can upload.
  it.effect("rejects the folder marker", () =>
    Effect.gen(function* () {
      const message = yield* sanitizeFileName(".keep").pipe(
        Effect.match({
          onFailure: (error) => error.message,
          onSuccess: () => "",
        }),
      )
      expect(message).toBe("Invalid file name")
    }),
  )
})
