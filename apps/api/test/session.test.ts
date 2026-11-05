import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer, Redacted, Result } from "effect"
import { Account, CurrentAccount, Session, Unauthorized } from "@private-drive/domain"
import { SessionLedger } from "../src/auth/ledger.ts"
import {
  cookieOptions,
  issueSession,
  sameSecret,
  sessionClaims,
  sessionLifetime,
  SessionLive,
} from "../src/auth/session.ts"

describe("session tokens", () => {
  // Login compares digests, so two different passwords never compare as the stored one.
  it.effect("matches a password only when both sides are the same", () =>
    Effect.sync(() => {
      expect(sameSecret("secret", "admin", "admin")).toBe(true)
      expect(sameSecret("secret", "admin", "other")).toBe(false)
    }),
  )

  // Logout can revoke the nonce only when the cookie still parses to the same expiry.
  it.effect("round-trips a cookie and rejects a bad or expired one", () =>
    Effect.sync(() => {
      const token = issueSession("secret", 5_000, "nonce-1")
      expect(sessionClaims("secret", token, 1_000)).toEqual({ expiresAt: 5_000, nonce: "nonce-1" })
      expect(sessionClaims("secret", token, 5_000)).toBeUndefined()
      expect(sessionClaims("other", token, 1_000)).toBeUndefined()
      expect(sessionClaims("secret", "1.2.3.4", 0)).toBeUndefined()
      expect(sessionLifetime).toBe(7 * 24 * 60 * 60 * 1000)
    }),
  )

  // Clearing the cookie uses a zero lifetime so the browser drops it immediately.
  it.effect("builds cookie flags for a week, or clears them", () =>
    Effect.sync(() => {
      expect(cookieOptions(true, false)).toMatchObject({
        httpOnly: true,
        maxAge: sessionLifetime,
        secure: true,
      })
      expect(cookieOptions(false, true).maxAge).toBe(0)
    }),
  )
})

describe("SessionLive", () => {
  // A cookie the ledger still holds becomes the current account. Anything else stays logged out.
  it.effect("accepts a recorded cookie and rejects the rest", () =>
    Effect.gen(function* () {
      const session = yield* Session
      const allowed = yield* session.session(
        Effect.gen(function* () {
          return yield* CurrentAccount
        }),
        { credential: Redacted.make("good") },
      )
      expect(allowed).toBeInstanceOf(Account)
      const rejected = yield* session
        .session(Effect.succeed(new Account({})), { credential: Redacted.make("bad") })
        .pipe(Effect.result)
      expect(Result.isFailure(rejected) && rejected.failure).toBeInstanceOf(Unauthorized)
    }).pipe(
      Effect.provide(
        SessionLive.pipe(
          Layer.provide(
            Layer.succeed(SessionLedger, {
              accept: (token) => Effect.succeed(token === "good"),
              issue: () => Effect.succeed("issued"),
              revoke: () => Effect.void,
            }),
          ),
        ),
      ),
    ),
  )
})
