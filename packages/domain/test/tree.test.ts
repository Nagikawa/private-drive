import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import { folderCrumbs, folderTree } from "../src/utils/tree.ts"

describe("folderCrumbs", () => {
  // Root has no extra crumbs because the screen already shows a Root button.
  it.effect("returns nothing for Root", () =>
    Effect.gen(function* () {
      expect(yield* folderCrumbs("")).toEqual([])
    }),
  )

  // Each segment links to the path accumulated so far.
  it.effect("splits a nested folder", () =>
    Effect.gen(function* () {
      expect(yield* folderCrumbs("photos/trip")).toEqual([
        { name: "photos", path: "photos" },
        { name: "trip", path: "photos/trip" },
      ])
    }),
  )
})

describe("folderTree", () => {
  // A deep path grows the missing parents so the sidebar has somewhere to hang it.
  it.effect("fills missing parents", () =>
    Effect.gen(function* () {
      const tree = yield* folderTree([{ path: "photos/trip" }])
      expect(tree).toEqual([
        {
          children: [{ children: [], name: "trip", path: "photos/trip" }],
          name: "photos",
          path: "photos",
        },
      ])
    }),
  )
})
