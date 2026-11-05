import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import { pure } from "../src/utils/pure.ts"
import { parentFolder } from "../src/utils/paths.ts"

describe("pure", () => {
  // A successful helper returns its value without the caller yielding.
  it.effect("reads a successful effect", () =>
    Effect.gen(function* () {
      expect(pure(parentFolder("photos/trip"), "")).toBe("photos")
    }),
  )

  // A defect becomes the fallback instead of an exception at the sync boundary.
  it.effect("returns the fallback when the effect dies", () =>
    Effect.gen(function* () {
      expect(pure(Effect.die("boom"), "fallback")).toBe("fallback")
    }),
  )
})
