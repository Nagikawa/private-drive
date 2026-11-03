import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import { uniqueName } from "../src/utils/names.ts"

describe("uniqueName", () => {
  // The original name is kept when the folder does not already have it.
  it.effect("keeps an unused name", () =>
    Effect.gen(function*() {
      expect(yield* uniqueName("cat.jpg", new Set())).toBe("cat.jpg")
    }))

  // A collision gets the next free numeric suffix before the extension.
  it.effect("adds a suffix when the name is taken", () =>
    Effect.gen(function*() {
      expect(yield* uniqueName("cat.jpg", new Set(["cat.jpg", "cat-2.jpg"]))).toBe("cat-3.jpg")
    }))
})
