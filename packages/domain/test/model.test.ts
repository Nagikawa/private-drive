import { describe, expect, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { FileEntry, LoginPayload, OpenUpload, SourceId } from "../src/model.ts"

describe("domain models", () => {
  // A fractional size is not a stored byte count.
  it.effect("decodes a file and rejects a fractional upload size", () =>
    Effect.gen(function*() {
      const file = yield* Schema.decodeUnknownEffect(FileEntry)({
        contentType: "text/plain",
        createdAt: "2026-01-01T00:00:00.000Z",
        folder: "",
        id: "1",
        image: false,
        name: "a.txt",
        size: 1,
        source: "r2",
      })
      expect(file.name).toBe("a.txt")
      const size = yield* Schema.decodeUnknownEffect(OpenUpload)({
        contentType: "text/plain",
        folder: "",
        name: "a.txt",
        size: 1.5,
        source: "r2",
      }).pipe(Effect.result)
      expect(size._tag).toBe("Failure")
      const source = yield* Schema.decodeUnknownEffect(SourceId)("telegram")
      expect(source).toBe("telegram")
      const login = yield* Schema.decodeUnknownEffect(LoginPayload)({ password: "admin" })
      expect(login.password).toBe("admin")
    }))
})
