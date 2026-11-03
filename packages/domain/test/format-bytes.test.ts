import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import { formatBytes } from "../src/utils/bytes.ts"

describe("formatBytes", () => {
  // Small files stay in bytes.
  it.effect("formats bytes", () =>
    Effect.gen(function*() {
      expect(yield* formatBytes(512)).toBe("512 B")
    }))

  // Larger files pick a unit and drop the decimal once the number is wide.
  it.effect("formats kilobytes and megabytes", () =>
    Effect.gen(function*() {
      expect(yield* formatBytes(1536)).toBe("1.5 KB")
      expect(yield* formatBytes(10 * 1024)).toBe("10 KB")
      expect(yield* formatBytes(5 * 1024 * 1024)).toBe("5.0 MB")
    }))
})
