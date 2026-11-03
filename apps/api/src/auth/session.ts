import { createHmac, timingSafeEqual } from "node:crypto"
import { DateTime, Effect, Layer, Redacted } from "effect"
import { Account, CurrentAccount, Session, Unauthorized } from "@private-drive/domain"
import { AppConfig } from "../config.ts"

// Seven days matches the cookie lifetime, so the token and the browser expire together.
const week = 7 * 24 * 60 * 60 * 1000

// HMACs a value so a direct string compare never sees the raw session secret.
const digest = (secret: string, value: string): Buffer => createHmac("sha256", secret).update(value).digest()

// Compares secrets in constant time so login timing does not leak the password.
export const sameSecret = (secret: string, left: string, right: string): boolean =>
  timingSafeEqual(digest(secret, left), digest(secret, right))

// Issues an expiring token the browser can send back without a server-side session store.
export const issueSession = (secret: string, now: number): string => {
  const body = String(now + week)
  const signature = createHmac("sha256", secret).update(body).digest("base64url")
  return `${body}.${signature}`
}

// Accepts a cookie only when the signature matches and the embedded expiry is still ahead.
export const sessionValid = (secret: string, token: string, now: number): boolean => {
  const separator = token.lastIndexOf(".")
  if (separator <= 0) {
    return false
  }
  const body = token.slice(0, separator)
  const signature = token.slice(separator + 1)
  const expected = createHmac("sha256", secret).update(body).digest("base64url")
  const actual = Buffer.from(signature)
  const wanted = Buffer.from(expected)
  if (actual.length !== wanted.length || !timingSafeEqual(actual, wanted)) {
    return false
  }
  const expiresAt = Number(body)
  return Number.isFinite(expiresAt) && expiresAt > now
}

// Builds the session cookie flags, including a zero max-age when logout must clear it.
export const cookieOptions = (secure: boolean, clear: boolean) => ({
  httpOnly: true,
  maxAge: clear ? 0 : week,
  path: "/",
  sameSite: "lax" as const,
  secure,
})

// Checks the session cookie and provides the current account to protected routes.
export const SessionLive = Layer.effect(
  Session,
  Effect.gen(function*() {
    const config = yield* AppConfig
    const secret = Redacted.value(config.sessionSecret)
    return Session.of({
      // Turns a valid session cookie into the current account before a protected handler runs.
      session: Effect.fn("Session.session")(function*(httpEffect, { credential }) {
        const now = DateTime.toEpochMillis(yield* DateTime.now)
        if (!sessionValid(secret, Redacted.value(credential), now)) {
          return yield* new Unauthorized({ message: "Log in first" })
        }
        return yield* Effect.provideService(
          httpEffect,
          CurrentAccount,
          new Account({}),
        )
      }),
    })
  }),
)
