import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { InvalidFileName, InvalidFolderPath, ResourceNameError } from "../src/errors.ts"

describe("domain errors", () => {
  // Callers match these tags instead of reading thrown exceptions.
  it.effect("tags the expected failures", () =>
    Effect.sync(() => {
      expect(new InvalidFolderPath({ message: "bad" })._tag).toBe("InvalidFolderPath")
      expect(new InvalidFileName({ message: "bad" })._tag).toBe("InvalidFileName")
      expect(new ResourceNameError({ message: "bad" })._tag).toBe("ResourceNameError")
    }))
})
