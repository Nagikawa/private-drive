import { describe, expect, it } from "@effect/vitest"
import { Effect, FileSystem, Result } from "effect"
import { downloadPublic } from "../src/drive/download.ts"

const unusedFs = {} as FileSystem.FileSystem

describe("downloadPublic", () => {
  // A literal private address is refused before any request is made.
  it.effect("rejects a private address", () =>
    Effect.gen(function* () {
      const result = yield* downloadPublic("http://127.0.0.1/secret", undefined, unusedFs).pipe(
        Effect.result,
      )
      expect(Result.isFailure(result) && result.failure.message).toContain("Private network")
    }),
  )

  // The declared length is enough to stop a download that would exceed the store's cap.
  it.effect("rejects a URL whose content length is over the limit", () =>
    Effect.gen(function* () {
      const previous = globalThis.fetch
      globalThis.fetch = () =>
        Promise.resolve(
          new Response(new Uint8Array([1]), {
            headers: { "content-length": "999" },
            status: 200,
          }),
        )
      const result = yield* downloadPublic("http://1.1.1.1/file.bin", 10, unusedFs).pipe(
        Effect.result,
        Effect.ensuring(
          Effect.sync(() => {
            globalThis.fetch = previous
          }),
        ),
      )
      expect(Result.isFailure(result) && result.failure.message).toContain("size limit")
    }),
  )

  // Each redirect is checked again, so a public URL cannot hop onto the local machine.
  it.effect("rejects a redirect onto a private address", () =>
    Effect.gen(function* () {
      const previous = globalThis.fetch
      globalThis.fetch = () =>
        Promise.resolve(
          new Response(null, {
            headers: { location: "http://127.0.0.1/secret" },
            status: 302,
          }),
        )
      const result = yield* downloadPublic("http://1.1.1.1/file.bin", undefined, unusedFs).pipe(
        Effect.result,
        Effect.ensuring(
          Effect.sync(() => {
            globalThis.fetch = previous
          }),
        ),
      )
      expect(Result.isFailure(result) && result.failure.message).toContain("Private network")
    }),
  )
})
