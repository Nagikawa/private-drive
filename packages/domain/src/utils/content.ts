import * as Effect from "effect/Effect"

// Guesses a media type from the extension when an upload or remote listing does not provide one.
export const contentTypeFromName = Effect.fnUntraced(function*(name: string) {
  const extension = name.split(".").at(-1)?.toLowerCase() ?? ""
  const types: Readonly<Record<string, string>> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
    avif: "image/avif",
    mp4: "video/mp4",
    webm: "video/webm",
    mov: "video/quicktime",
    mp3: "audio/mpeg",
    wav: "audio/wav",
    ogg: "audio/ogg",
    pdf: "application/pdf",
    txt: "text/plain",
    md: "text/markdown",
    json: "application/json",
    zip: "application/zip",
  }
  return types[extension] ?? "application/octet-stream"
})

// Lets the file grid decide which entries can use an image preview.
export const isImageContent = Effect.fnUntraced(function*(contentType: string) {
  return contentType.startsWith("image/")
})

// Lets the preview dialog choose a video player.
export const isVideoContent = Effect.fnUntraced(function*(contentType: string) {
  return contentType.startsWith("video/")
})

// Lets the preview dialog choose an audio player.
export const isAudioContent = Effect.fnUntraced(function*(contentType: string) {
  return contentType.startsWith("audio/")
})

// Lets the preview dialog fetch the body and show it as text.
export const isTextContent = Effect.fnUntraced(function*(contentType: string) {
  return contentType.startsWith("text/") || contentType === "application/json"
})

// Lets the preview dialog embed a PDF instead of treating it as a download.
export const isPdfContent = Effect.fnUntraced(function*(contentType: string) {
  return contentType === "application/pdf"
})
