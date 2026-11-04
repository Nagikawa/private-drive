import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { ConfigProvider, Effect, Layer } from "effect"
import { AppConfig } from "../src/config.ts"

// Each test gets a directory that disappears when the test scope closes.
export const tempDirectory = Effect.gen(function*() {
  const directory = yield* Effect.tryPromise({
    try: () => mkdtemp(join(tmpdir(), "private-drive-")),
    catch: () => new Error("Could not create a temp directory"),
  })
  yield* Effect.addFinalizer(() =>
    Effect.tryPromise({
      try: () => rm(directory, { force: true, recursive: true }),
      catch: () => new Error("Could not remove the temp directory"),
    }).pipe(Effect.ignore)
  )
  return directory
})

// Supplies the required secrets without reading the developer's environment.
export const configFor = (indexPath: string, extra: Record<string, string> = {}) =>
  AppConfig.layer.pipe(
    Layer.provide(ConfigProvider.layer(ConfigProvider.fromEnvRecord({
      AUTH_PASSWORD: "admin",
      COOKIE_SECURE: "false",
      INDEX_PATH: indexPath,
      SESSION_SECRET: "test-secret",
      ...extra,
    }))),
  )
