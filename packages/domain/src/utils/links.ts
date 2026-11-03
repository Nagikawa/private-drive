import * as Effect from "effect/Effect"

export type LinkFormat = "url" | "markdown" | "html" | "bbcode"

// Escapes text placed into an HTML link so a file name cannot break the markup.
export const escapeHtml = Effect.fnUntraced(function*(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("\"", "&quot;")
})

// Builds the content path the browser loads for one file id.
export const contentPath = Effect.fnUntraced(function*(id: string) {
  return `/api/files/${encodeURIComponent(id)}/content`
})

// Builds a shareable content URL from an origin the caller already has, so this package stays free of the DOM.
export const absoluteContentUrl = Effect.fnUntraced(function*(origin: string, id: string) {
  return `${origin}${yield* contentPath(id)}`
})

// Formats a copied link as a plain URL, Markdown, HTML, or BBCode.
export const formatLink = Effect.fnUntraced(function*(input: {
  readonly format: LinkFormat
  readonly image: boolean
  readonly name: string
  readonly url: string
}) {
  const { format, image, name, url } = input
  switch (format) {
    case "url":
      return url
    case "markdown":
      return image ? `![${name}](${url})` : `[${name}](${url})`
    case "html":
      return image
        ? `<img src="${yield* escapeHtml(url)}" alt="${yield* escapeHtml(name)}">`
        : `<a href="${yield* escapeHtml(url)}">${yield* escapeHtml(name)}</a>`
    case "bbcode":
      return image ? `[img]${url}[/img]` : `[url=${url}]${name}[/url]`
  }
})
