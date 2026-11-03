import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import { connectedResource } from "../src/policy/resource.ts"

describe("connectedResource", () => {
  // The bucket name is the text after the connected prefix.
  it.effect("returns an R2 bucket name", () =>
    Effect.gen(function*() {
      expect(yield* connectedResource("Connected nagikawa-cloud")).toBe("nagikawa-cloud")
    }))

  // A dataset id can contain a slash and is still one resource name.
  it.effect("returns a Hugging Face repo", () =>
    Effect.gen(function*() {
      expect(yield* connectedResource("Connected avalanch3/nagiwaka-cloud")).toBe(
        "avalanch3/nagiwaka-cloud",
      )
    }))

  // A status without that prefix is a tagged error, not a thrown exception.
  it.effect("fails when the status has no resource name", () =>
    Effect.gen(function*() {
      const error = yield* connectedResource("Not configured").pipe(Effect.flip)
      expect(error._tag).toBe("ResourceNameError")
      expect(error.message).toBe("Status has no resource name")
    }))

  // An empty name after the prefix is the same tagged failure.
  it.effect("fails when the resource name is blank", () =>
    Effect.gen(function*() {
      const error = yield* connectedResource("Connected ").pipe(Effect.flip)
      expect(error._tag).toBe("ResourceNameError")
    }))
})
