import { join } from "node:path"
import { NodeFileSystem, NodePath } from "@effect/platform-node"
import { describe, expect, it } from "@effect/vitest"
import { Effect, FileSystem, Path, Result } from "effect"
import { FetchHttpClient, HttpClient } from "effect/http"
import { AppConfig } from "../src/config.ts"
import { Drive } from "../src/drive/drive.ts"
import { AuditLog } from "../src/audit/log.ts"
import { HuggingFace } from "../src/storage/huggingface.ts"
import { R2 } from "../src/storage/r2.ts"
import { Stores } from "../src/storage/stores.ts"
import { Telegram } from "../src/storage/telegram.ts"
import { configFor, tempDirectory } from "./support.ts"

const withPlatform =
  <A, E>(
    effect: Effect.Effect<
      A,
      E,
      AppConfig | FileSystem.FileSystem | Path.Path | HttpClient.HttpClient
    >,
  ) =>
  (directory: string) =>
    effect.pipe(
      Effect.provide(NodeFileSystem.layer),
      Effect.provide(NodePath.layer),
      Effect.provide(FetchHttpClient.layer),
      Effect.provide(configFor(join(directory, "index.json"))),
    )

describe("unconfigured stores", () => {
  // Missing credentials fail before a network call, and the registry still lists every source.
  it.effect("reports every source and refuses a write", () =>
    Effect.gen(function* () {
      const directory = yield* tempDirectory
      const stores = yield* withPlatform(
        Effect.gen(function* () {
          return yield* Stores
        }).pipe(Effect.provide(Stores.layer)),
      )(directory)
      expect(stores.all.map((store) => store.id)).toEqual(["r2", "telegram", "huggingface"])
      expect(stores.get("telegram").listsRemotely).toBe(false)
      expect(stores.get("r2").configured).toBe(false)
      const r2 = yield* withPlatform(
        Effect.gen(function* () {
          return yield* R2
        }).pipe(Effect.provide(R2.layer)),
      )(directory)
      const telegram = yield* withPlatform(
        Effect.gen(function* () {
          return yield* Telegram
        }).pipe(Effect.provide(Telegram.layer)),
      )(directory)
      const huggingface = yield* withPlatform(
        Effect.gen(function* () {
          return yield* HuggingFace
        }).pipe(Effect.provide(HuggingFace.layer)),
      )(directory)
      const listed = yield* r2.list("", false).pipe(Effect.result)
      const status = yield* telegram.status().pipe(Effect.result)
      const removed = yield* huggingface.delete("a").pipe(Effect.result)
      expect(Result.isFailure(listed) && listed.failure.message).toContain("Cloudflare R2")
      expect(Result.isFailure(status) && status.failure.message).toContain("Telegram")
      expect(Result.isFailure(removed) && removed.failure.message).toContain("Hugging Face")
      const drive = yield* withPlatform(
        Effect.gen(function* () {
          return yield* Drive
        }).pipe(Effect.provide(Drive.layer), Effect.provide(AuditLog.layer)),
      )(directory)
      const uploaded = yield* drive
        .upload({
          contentType: "text/plain",
          folder: "",
          name: "a.txt",
          path: "missing",
          size: 1,
          source: "r2",
        })
        .pipe(Effect.result)
      expect(Result.isFailure(uploaded) && uploaded.failure.message).toContain("not set")
    }),
  )
})
