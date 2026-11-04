import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import { uploadPartBytes, uploadParts } from "../src/utils/upload-parts.ts"

const mebibyte = 1024 * 1024

describe("uploadParts", () => {
  // Empty and invalid sizes do not invent a part.
  it.effect("returns no parts for an empty file", () =>
    Effect.gen(function*() {
      expect(uploadParts(0, uploadPartBytes(0))).toEqual([])
      expect(uploadParts(-1, mebibyte)).toEqual([])
      expect(uploadParts(mebibyte, 0)).toEqual([])
    }))

  // A file under the 8 MiB floor stays a single range so the caller can use one request.
  it.effect("keeps a small file in one part", () =>
    Effect.gen(function*() {
      const size = 3 * mebibyte
      const partBytes = uploadPartBytes(size)
      expect(partBytes).toBe(8 * mebibyte)
      expect(uploadParts(size, partBytes)).toEqual([
        { length: size, number: 1, offset: 0 },
      ])
    }))

  // The old 100 MB cap is larger than one part, so the upload is split instead of rejected.
  it.effect("splits a file above 100 MB", () =>
    Effect.gen(function*() {
      const size = 100 * mebibyte + 1
      const partBytes = uploadPartBytes(size)
      const parts = uploadParts(size, partBytes)
      expect(parts.length).toBeGreaterThan(1)
      expect(parts[0]).toEqual({ length: partBytes, number: 1, offset: 0 })
      const last = parts.at(-1)
      expect(last).toBeDefined()
      expect(last!.length).toBeLessThanOrEqual(partBytes)
      expect(last!.number).toBe(parts.length)
    }))

  // Every byte belongs to one part, and only the last part may be shorter than the part size.
  it.effect("covers the file with contiguous parts", () =>
    Effect.gen(function*() {
      const size = 20 * mebibyte + 100
      const partBytes = 8 * mebibyte
      const parts = uploadParts(size, partBytes)
      let cursor = 0
      for (const part of parts) {
        expect(part.offset).toBe(cursor)
        expect(part.number).toBe(parts.indexOf(part) + 1)
        if (part.number < parts.length) {
          expect(part.length).toBe(partBytes)
        }
        cursor += part.length
      }
      expect(cursor).toBe(size)
      expect(parts.at(-1)?.length).toBe(size - partBytes * (parts.length - 1))
    }))

  // A multi-terabyte object still stays within S3's 10,000-part cap, with parts of at least 5 MiB.
  it.effect("keeps a multi-terabyte file within 10000 parts", () =>
    Effect.gen(function*() {
      const size = 5 * 1024 * 1024 * 1024 * 1024
      const partBytes = uploadPartBytes(size)
      const parts = uploadParts(size, partBytes)
      expect(partBytes).toBeGreaterThanOrEqual(8 * mebibyte)
      expect(parts.length).toBeLessThanOrEqual(10_000)
      expect(parts.length).toBeGreaterThan(1)
      for (const part of parts.slice(0, -1)) {
        expect(part.length).toBeGreaterThanOrEqual(5 * mebibyte)
      }
      const covered = parts.reduce((total, part) => total + part.length, 0)
      expect(covered).toBe(size)
    }))
})
