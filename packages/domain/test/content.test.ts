import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import {
  contentTypeFromName,
  isAudioContent,
  isImageContent,
  isPdfContent,
  isTextContent,
  isVideoContent,
} from "../src/utils/content.ts"

describe("contentTypeFromName", () => {
  // Known image extensions map to a previewable type.
  it.effect("maps a jpeg name", () =>
    Effect.gen(function* () {
      expect(yield* contentTypeFromName("Cat.JPG")).toBe("image/jpeg")
    }),
  )

  // An unknown extension stays a generic download.
  it.effect("falls back to octet-stream", () =>
    Effect.gen(function* () {
      expect(yield* contentTypeFromName("notes.bin")).toBe("application/octet-stream")
    }),
  )
})

describe("isAudioContent", () => {
  // Audio types use the audio player.
  it.effect("accepts an audio type", () =>
    Effect.gen(function* () {
      expect(yield* isAudioContent("audio/mpeg")).toBe(true)
    }),
  )
})

describe("isImageContent", () => {
  // Image types can use the image preview.
  it.effect("accepts an image type", () =>
    Effect.gen(function* () {
      expect(yield* isImageContent("image/png")).toBe(true)
    }),
  )

  // Other types stay in the generic preview.
  it.effect("rejects a video type", () =>
    Effect.gen(function* () {
      expect(yield* isImageContent("video/mp4")).toBe(false)
    }),
  )
})

describe("isPdfContent", () => {
  // PDF files use the embedded frame.
  it.effect("accepts a pdf type", () =>
    Effect.gen(function* () {
      expect(yield* isPdfContent("application/pdf")).toBe(true)
    }),
  )
})

describe("isTextContent", () => {
  // Text and JSON are fetched and shown as text.
  it.effect("accepts text and json", () =>
    Effect.gen(function* () {
      expect(yield* isTextContent("text/plain")).toBe(true)
      expect(yield* isTextContent("application/json")).toBe(true)
    }),
  )
})

describe("isVideoContent", () => {
  // Video types use the video player.
  it.effect("accepts a video type", () =>
    Effect.gen(function* () {
      expect(yield* isVideoContent("video/mp4")).toBe(true)
    }),
  )
})
