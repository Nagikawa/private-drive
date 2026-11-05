import { describe, expect, it } from "@effect/vitest"
import { Effect, Stream } from "effect"
import type { HuggingFace } from "../src/storage/huggingface.ts"
import { huggingfaceStore } from "../src/storage/huggingface-store.ts"

const log: Array<string> = []

const huggingface = {
  configured: true,
  delete: (key: string) =>
    Effect.sync(() => {
      log.push(`delete ${key}`)
    }),
  get: (key: string) =>
    Effect.sync(() => {
      log.push(`get ${key}`)
      return new Uint8Array([1])
    }),
  list: () => Effect.succeed({ files: [], folders: [], truncated: false }),
  open: () => Effect.succeed(Stream.empty),
  put: (key: string, bytes: Uint8Array) =>
    Effect.sync(() => {
      log.push(`put ${key} ${bytes.byteLength}`)
    }),
  putFile: (key: string) =>
    Effect.sync(() => {
      log.push(`putFile ${key}`)
    }),
  status: () => Effect.succeed("repo"),
} as HuggingFace["Service"]

describe("huggingfaceStore", () => {
  // The dataset API has no copy, so a rename downloads the bytes and writes them under the new key.
  it.effect("rewrites an object under the new key", () =>
    Effect.gen(function* () {
      log.length = 0
      const store = huggingfaceStore(huggingface)
      expect(yield* store.relocate("old", "new")).toBe("new")
      expect(log).toEqual(["get old", "put new 1", "delete old"])
    }),
  )
})
