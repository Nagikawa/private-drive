import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { Api, formatBytes, pageFiles } from "../src/index.ts"

describe("domain entry", () => {
  // The package entry re-exports the helpers the API and the web app import.
  it.effect("exposes paging, byte labels, and the HTTP contract", () =>
    Effect.gen(function* () {
      expect(pageFiles([], { order: "asc", sort: "name" }).files).toEqual([])
      expect(yield* formatBytes(0)).toBe("0 B")
      expect(Api).toBeDefined()
    }),
  )
})
