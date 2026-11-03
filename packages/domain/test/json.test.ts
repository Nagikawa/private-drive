import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import { failureMessage, parseJson } from "../src/utils/json.ts"

describe("parseJson", () => {
  // An empty body is not a payload.
  it.effect("returns undefined for an empty body", () =>
    Effect.gen(function*() {
      expect(yield* parseJson("")).toBeUndefined()
    }))

  // Valid JSON becomes a value the caller can read.
  it.effect("parses an object", () =>
    Effect.gen(function*() {
      expect(yield* parseJson("{\"message\":\"nope\"}")).toEqual({ message: "nope" })
    }))

  // Invalid JSON is a tagged error, not a thrown SyntaxError.
  it.effect("fails when the text is not JSON", () =>
    Effect.gen(function*() {
      const message = yield* parseJson("{").pipe(Effect.match({
        onFailure: (error) => error.message,
        onSuccess: () => "",
      }))
      expect(message).toBe("The response format is invalid")
    }))
})

describe("failureMessage", () => {
  // A string message field is what the notice should show.
  it.effect("reads a message field", () =>
    Effect.gen(function*() {
      expect(yield* failureMessage({ message: "Folder is not empty" }, "Request failed")).toBe(
        "Folder is not empty",
      )
    }))

  // Anything else keeps the caller's fallback.
  it.effect("uses the fallback when the body has no message", () =>
    Effect.gen(function*() {
      expect(yield* failureMessage({ ok: false }, "Request failed")).toBe("Request failed")
    }))
})
