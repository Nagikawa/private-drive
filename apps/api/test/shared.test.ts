import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { bytesOf, keepName, labels, unavailable } from "../src/storage/shared.ts"

describe("storage labels", () => {
  // The UI and the errors use the same names for the three sources.
  it.effect("names each source and explains a missing configuration", () =>
    Effect.sync(() => {
      expect(labels.r2).toBe("Cloudflare R2")
      expect(labels.telegram).toBe("Telegram")
      expect(labels.huggingface).toBe("Hugging Face")
      expect(keepName).toBe(".keep")
      expect(unavailable("telegram").message).toContain("Telegram")
      expect(bytesOf(new Uint8Array(4))).toBe(4)
    }),
  )
})
