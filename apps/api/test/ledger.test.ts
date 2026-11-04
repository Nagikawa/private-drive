import { join } from "node:path"
import { NodeFileSystem, NodePath } from "@effect/platform-node"
import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { SessionLedger } from "../src/auth/ledger.ts"
import { configFor, tempDirectory } from "./support.ts"

const ledgerIn = (directory: string) =>
  Effect.gen(function*() {
    return yield* SessionLedger
  }).pipe(
    Effect.provide(SessionLedger.layer),
    Effect.provide(NodeFileSystem.layer),
    Effect.provide(NodePath.layer),
    Effect.provide(configFor(join(directory, "index.json"))),
  )

describe("SessionLedger", () => {
  // Logout removes the nonce, so a copied cookie stops working before the week is over.
  it.effect("issues a cookie, then rejects it after revoke", () =>
    Effect.gen(function*() {
      const directory = yield* tempDirectory
      const ledger = yield* ledgerIn(directory)
      const now = 1_000
      const token = yield* ledger.issue(now)
      expect(yield* ledger.accept(token, now)).toBe(true)
      yield* ledger.revoke(token, now)
      expect(yield* ledger.accept(token, now)).toBe(false)
      expect(yield* ledger.accept("not-a-cookie", now)).toBe(false)
    }))
})
