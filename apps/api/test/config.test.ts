import { describe, expect, it } from "@effect/vitest"
import { Effect, Redacted } from "effect"
import { AppConfig } from "../src/config.ts"
import { configFor } from "./support.ts"

describe("AppConfig", () => {
  // A blank credential must not look configured, even when the other R2 fields are filled in.
  it.effect("leaves a provider unset when any required field is blank", () =>
    Effect.gen(function* () {
      const config = yield* AppConfig
      expect(config.r2).toBeUndefined()
      expect(config.telegram).toBeUndefined()
      expect(config.huggingface).toBeUndefined()
      expect(config.port).toBe(8787)
      expect(config.cookieSecure).toBe(false)
      expect(Redacted.value(config.authPassword)).toBe("admin")
    }).pipe(
      Effect.provide(
        configFor("/tmp/private-drive-config/index.json", {
          HF_TOKEN: "token",
          R2_ACCESS_KEY_ID: "key",
          R2_ACCOUNT_ID: " ",
          R2_BUCKET: "bucket",
          R2_SECRET_ACCESS_KEY: "secret",
          TG_BOT_TOKEN: "token",
        }),
      ),
    ),
  )

  // All four R2 fields, and both fields of the other providers, turn those stores on.
  it.effect("reads a complete provider", () =>
    Effect.gen(function* () {
      const config = yield* AppConfig
      expect(config.r2?.bucket).toBe("drive")
      expect(config.telegram?.chatId).toBe("1")
      expect(config.huggingface?.repo).toBe("owner/set")
      expect(config.port).toBe(8791)
      expect(config.cookieSecure).toBe(true)
    }).pipe(
      Effect.provide(
        configFor("/tmp/private-drive-config/index.json", {
          COOKIE_SECURE: "true",
          HF_REPO: "owner/set",
          HF_TOKEN: "token",
          PORT: "8791",
          R2_ACCESS_KEY_ID: "key",
          R2_ACCOUNT_ID: "account",
          R2_BUCKET: "drive",
          R2_SECRET_ACCESS_KEY: "secret",
          TG_BOT_TOKEN: "token",
          TG_CHAT_ID: "1",
        }),
      ),
    ),
  )
})
