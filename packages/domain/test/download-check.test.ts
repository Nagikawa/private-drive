import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import { blockedAddress, inspectDownloadUrl } from "../src/policy/download-check.ts"

const messageOf = (rawUrl: string) =>
  inspectDownloadUrl(rawUrl).pipe(
    Effect.match({
      onFailure: (error) => error.message,
      onSuccess: (url) => url.href,
    }),
  )

describe("blockedAddress", () => {
  // Private and loopback ranges are refused before a download starts.
  it.effect("blocks private ranges", () =>
    Effect.gen(function* () {
      expect(yield* blockedAddress("127.0.0.1")).toBe(true)
      expect(yield* blockedAddress("10.1.2.3")).toBe(true)
      expect(yield* blockedAddress("192.168.1.9")).toBe(true)
      expect(yield* blockedAddress("::1")).toBe(true)
    }),
  )

  // A public address can continue to the download.
  it.effect("allows a public address", () =>
    Effect.gen(function* () {
      expect(yield* blockedAddress("8.8.8.8")).toBe(false)
    }),
  )
})

describe("inspectDownloadUrl", () => {
  // A public http URL is accepted and returned as a URL.
  it.effect("accepts a public http URL", () =>
    Effect.gen(function* () {
      expect(yield* messageOf("https://example.com/cat.jpg")).toBe("https://example.com/cat.jpg")
    }),
  )

  // Broken, credentialed, and private targets fail with a message instead of throwing.
  it.effect("rejects unsafe URLs", () =>
    Effect.gen(function* () {
      expect(yield* messageOf("not a url")).toBe("Invalid URL")
      expect(yield* messageOf("ftp://example.com/cat.jpg")).toBe(
        "Only http or https URLs are accepted",
      )
      expect(yield* messageOf("https://user:pass@example.com/cat.jpg")).toBe(
        "URLs with credentials are not accepted",
      )
      expect(yield* messageOf("http://127.0.0.1/cat.jpg")).toBe(
        "Private network URLs are not accepted",
      )
      expect(yield* messageOf("http://localhost/cat.jpg")).toBe(
        "Private network URLs are not accepted",
      )
    }),
  )
})
