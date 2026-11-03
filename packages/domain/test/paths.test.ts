import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import {
  folderName,
  isDirectChildFolder,
  isWithinFolder,
  joinFolder,
  parentFolder,
  splitStorageKey,
  storageKey,
} from "../src/utils/paths.ts"

describe("parentFolder", () => {
  // A nested path points at the folder above it.
  it.effect("returns the parent", () =>
    Effect.gen(function*() {
      expect(yield* parentFolder("photos/trip")).toBe("photos")
    }))

  // A top-level folder's parent is Root.
  it.effect("returns Root for a top-level folder", () =>
    Effect.gen(function*() {
      expect(yield* parentFolder("photos")).toBe("")
    }))
})

describe("folderName", () => {
  // Labels use the last segment.
  it.effect("returns the last segment", () =>
    Effect.gen(function*() {
      expect(yield* folderName("photos/trip")).toBe("trip")
    }))

  // A top-level folder is its own label.
  it.effect("returns a top-level name unchanged", () =>
    Effect.gen(function*() {
      expect(yield* folderName("photos")).toBe("photos")
    }))
})

describe("joinFolder", () => {
  // Root stays an empty path, so the child is the whole key.
  it.effect("joins onto Root without a leading slash", () =>
    Effect.gen(function*() {
      expect(yield* joinFolder("", "cat.jpg")).toBe("cat.jpg")
    }))

  // A nested folder keeps a single slash between the parts.
  it.effect("joins a child under a folder", () =>
    Effect.gen(function*() {
      expect(yield* joinFolder("photos", "cat.jpg")).toBe("photos/cat.jpg")
    }))
})

describe("storageKey", () => {
  // The object key uses the same join rules as the folder shown in the UI.
  it.effect("builds a key from a folder and a name", () =>
    Effect.gen(function*() {
      expect(yield* storageKey("photos", "cat.jpg")).toBe("photos/cat.jpg")
    }))
})

describe("splitStorageKey", () => {
  // A nested key splits into the folder the UI shows and the file name.
  it.effect("splits a nested key", () =>
    Effect.gen(function*() {
      expect(yield* splitStorageKey("photos/cat.jpg")).toEqual({
        folder: "photos",
        name: "cat.jpg",
      })
    }))

  // A key with no slash lives at Root.
  it.effect("puts a bare name at Root", () =>
    Effect.gen(function*() {
      expect(yield* splitStorageKey("cat.jpg")).toEqual({ folder: "", name: "cat.jpg" })
    }))
})

describe("isDirectChildFolder", () => {
  // A non-recursive listing shows only the next level.
  it.effect("accepts one level under the parent", () =>
    Effect.gen(function*() {
      expect(yield* isDirectChildFolder("photos", "photos/trip")).toBe(true)
    }))

  // A grandchild belongs in a recursive listing, not a direct one.
  it.effect("rejects a grandchild", () =>
    Effect.gen(function*() {
      expect(yield* isDirectChildFolder("photos", "photos/trip/day")).toBe(false)
    }))
})

describe("isWithinFolder", () => {
  // The folder itself and its descendants stay in a recursive listing.
  it.effect("includes the folder and a descendant", () =>
    Effect.gen(function*() {
      expect(yield* isWithinFolder("photos", "photos")).toBe(true)
      expect(yield* isWithinFolder("photos", "photos/trip")).toBe(true)
    }))

  // A sibling folder is outside the scope.
  it.effect("excludes a sibling", () =>
    Effect.gen(function*() {
      expect(yield* isWithinFolder("photos", "video")).toBe(false)
    }))

  // Root contains every path.
  it.effect("treats Root as the whole drive", () =>
    Effect.gen(function*() {
      expect(yield* isWithinFolder("", "photos/trip")).toBe(true)
    }))
})
