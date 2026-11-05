import { Effect, Predicate } from "effect"
import { InvalidJson } from "../errors.ts"

// Parses an error body when it is JSON, and leaves an empty body as no payload.
export const parseJson = Effect.fnUntraced(function* (text: string) {
  if (text === "") {
    return undefined
  }
  return yield* Effect.try({
    try: () => JSON.parse(text) as unknown,
    catch: () => new InvalidJson({ message: "The response format is invalid" }),
  })
})

// Prefers a message field so a failed call can show the server reason.
export const failureMessage = Effect.fnUntraced(function* (parsed: unknown, fallback: string) {
  if (
    Predicate.isObject(parsed) &&
    Predicate.hasProperty(parsed, "message") &&
    Predicate.isString(parsed.message)
  ) {
    return parsed.message
  }
  return fallback
})
