import { Effect, Schema } from "effect"
import { ResourceNameError } from "../errors.ts"

// Matches "Connected <name>" and keeps the name only when it is a real bucket or repo.
const ConnectedDetail = Schema.TemplateLiteralParser([
  "Connected ",
  Schema.NonEmptyString.check(Schema.isTrimmed()),
])

// Splits a provider status into the resource name. A mismatch fails with a tagged error and does not throw.
export const connectedResource = Effect.fnUntraced(function*(detail: string) {
  const parts = yield* Schema.decodeUnknownEffect(ConnectedDetail)(detail).pipe(
    Effect.mapError(() => new ResourceNameError({ message: "Status has no resource name" })),
  )
  return parts[1]
})
