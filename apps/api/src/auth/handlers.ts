import { DateTime, Effect, Redacted } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { Account, Api, CurrentAccount, LoginPayload, SessionCookie, Unauthorized } from "@private-drive/domain"
import { AppConfig } from "../config.ts"
import { cookieOptions, issueSession, sameSecret } from "./session.ts"

// Checks the posted password and sets the session cookie the browser will send on later calls.
const login = Effect.fn("Session.login")(function*(config: AppConfig["Service"], payload: LoginPayload) {
  const secret = Redacted.value(config.sessionSecret)
  const passwordOk = sameSecret(secret, payload.password, Redacted.value(config.authPassword))
  if (!passwordOk) {
    return yield* new Unauthorized({ message: "Incorrect password" })
  }
  const now = DateTime.toEpochMillis(yield* DateTime.now)
  yield* HttpApiBuilder.securitySetCookie(
    SessionCookie,
    issueSession(secret, now),
    cookieOptions(config.cookieSecure, false),
  )
  return new Account({})
})

export const SessionHandlers = HttpApiBuilder.group(
  Api,
  "session",
  Effect.fn("SessionHandlers")(function*(handlers) {
    const config = yield* AppConfig
    return handlers.handleAll({
      // Returns the account already attached by session middleware.
      current: () => CurrentAccount,
      // Exchanges a password for a session cookie.
      login: ({ payload }) => login(config, payload),
      // Clears the session cookie so the next request is logged out.
      logout: () =>
        HttpApiBuilder.securitySetCookie(SessionCookie, "", cookieOptions(config.cookieSecure, true)),
    })
  }),
)
