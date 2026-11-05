import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { NodeFileSystem, NodePath } from "@effect/platform-node"
import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { AuditLog } from "../src/audit/log.ts"
import { configFor, tempDirectory } from "./support.ts"

describe("AuditLog", () => {
  // Newlines cannot break the JSONL record, and a very long detail is cut off.
  it.effect("appends one JSON line with a flattened detail", () =>
    Effect.gen(function* () {
      const directory = yield* tempDirectory
      const audit = yield* Effect.gen(function* () {
        return yield* AuditLog
      }).pipe(
        Effect.provide(AuditLog.layer),
        Effect.provide(NodeFileSystem.layer),
        Effect.provide(NodePath.layer),
        Effect.provide(configFor(join(directory, "index.json"))),
      )
      yield* audit.record("rename", "a\nb" + "x".repeat(400))
      const text = yield* Effect.tryPromise({
        try: () => readFile(join(directory, "audit.jsonl"), "utf8"),
        catch: () => new Error("Could not read the audit log"),
      })
      const [line] = text.trim().split("\n")
      const parsed: unknown = JSON.parse(line ?? "")
      expect(parsed).toMatchObject({ action: "rename" })
      if (
        typeof parsed === "object" &&
        parsed !== null &&
        "detail" in parsed &&
        typeof parsed.detail === "string"
      ) {
        expect(parsed.detail.startsWith("a b")).toBe(true)
        expect(parsed.detail.includes("\n")).toBe(false)
        expect(parsed.detail.length).toBe(300)
      } else {
        expect(parsed).toEqual({ detail: "missing" })
      }
    }),
  )
})
