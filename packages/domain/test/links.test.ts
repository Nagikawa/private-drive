import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import { absoluteContentUrl, contentPath, escapeHtml, formatLink } from "../src/utils/links.ts"

const url = "https://drive.example/api/files/cat/content"

describe("escapeHtml", () => {
  // Markup characters in a file name cannot close the tag.
  it.effect("escapes markup", () =>
    Effect.gen(function* () {
      expect(yield* escapeHtml(`a&b<"c">`)).toBe("a&amp;b&lt;&quot;c&quot;&gt;")
    }),
  )
})

describe("contentPath", () => {
  // The id is encoded so a slash in it cannot change the route.
  it.effect("encodes the file id", () =>
    Effect.gen(function* () {
      expect(yield* contentPath("a/b")).toBe("/api/files/a%2Fb/content")
    }),
  )
})

describe("absoluteContentUrl", () => {
  // The origin is supplied by the caller so the helper does not touch the browser.
  it.effect("prefixes the origin", () =>
    Effect.gen(function* () {
      expect(yield* absoluteContentUrl("https://drive.example", "cat")).toBe(
        "https://drive.example/api/files/cat/content",
      )
    }),
  )
})

describe("formatLink", () => {
  // Each format matches the menu the file page copies from.
  it.effect("formats url, markdown, html, and bbcode", () =>
    Effect.gen(function* () {
      expect(yield* formatLink({ format: "url", image: true, name: "cat", url })).toBe(url)
      expect(yield* formatLink({ format: "markdown", image: true, name: "cat", url })).toBe(
        `![cat](${url})`,
      )
      expect(yield* formatLink({ format: "markdown", image: false, name: "cat", url })).toBe(
        `[cat](${url})`,
      )
      expect(yield* formatLink({ format: "html", image: false, name: "a<b", url })).toBe(
        `<a href="${url}">a&lt;b</a>`,
      )
      expect(yield* formatLink({ format: "bbcode", image: true, name: "cat", url })).toBe(
        `[img]${url}[/img]`,
      )
    }),
  )
})
