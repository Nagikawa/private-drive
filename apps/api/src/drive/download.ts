import { lookup } from "node:dns/promises"
import { Effect } from "effect"
import { StorageError, blockedAddress, contentTypeFromName, inspectDownloadUrl, sanitizeFileName } from "@private-drive/domain"

// Resolves a hostname and refuses it when any address is private, before the body is read.
const assertPublicHost = Effect.fn("Drive.assertPublicHost")(function*(url: URL) {
  const host = url.hostname.replace(/^\[|\]$/g, "")
  const parts = host.split(".")
  const literalAddress = host.includes(":") ||
    (parts.length === 4 && parts.every((part) => part !== "" && Number.isInteger(Number(part))))
  if (literalAddress) {
    return
  }
  const records = yield* Effect.tryPromise({
    catch: () => new StorageError({ message: "Could not resolve the URL" }),
    try: () => lookup(host, { all: true, verbatim: true }),
  })
  const blocked = yield* Effect.forEach(records, (record) => blockedAddress(record.address))
  if (records.length === 0 || blocked.some((address) => address)) {
    return yield* new StorageError({ message: "Private network URLs are not accepted" })
  }
})

// Downloads a public URL with manual redirects so each hop is checked before it is followed.
export const downloadPublic = Effect.fn("Drive.downloadPublic")(function*(rawUrl: string, maxBytes: number) {
  let current = yield* inspectDownloadUrl(rawUrl).pipe(
    Effect.mapError((error) => new StorageError({ message: error.message })),
  )
  for (let hop = 0; hop < 3; hop += 1) {
    yield* assertPublicHost(current)
    const response = yield* Effect.tryPromise({
      catch: () => new StorageError({ message: "Could not download the URL" }),
      try: () => fetch(current, { redirect: "manual" }),
    })
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location")
      if (location === null) {
        return yield* new StorageError({ message: "The download URL has no redirect target" })
      }
      const next = yield* Effect.try({
        catch: () => new StorageError({ message: "Invalid URL" }),
        try: () => new URL(location, current).href,
      })
      current = yield* inspectDownloadUrl(next).pipe(
        Effect.mapError((error) => new StorageError({ message: error.message })),
      )
      continue
    }
    if (!response.ok || response.body === null) {
      return yield* new StorageError({ message: `Download failed (${response.status})` })
    }
    const length = Number(response.headers.get("content-length") ?? "0")
    if (Number.isFinite(length) && length > maxBytes) {
      return yield* new StorageError({ message: "The URL file exceeds the size limit" })
    }
    const reader = response.body.getReader()
    const chunks: Array<Uint8Array> = []
    let total = 0
    while (true) {
      const step = yield* Effect.tryPromise({
        catch: () => new StorageError({ message: "Could not read the URL content" }),
        try: () => reader.read(),
      })
      if (step.done) {
        break
      }
      total += step.value.byteLength
      if (total > maxBytes) {
        return yield* new StorageError({ message: "The URL file exceeds the size limit" })
      }
      chunks.push(step.value)
    }
    const bytes = new Uint8Array(total)
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.byteLength
    }
    const rawName = yield* Effect.try({
      catch: () => new StorageError({ message: "Invalid file name" }),
      try: () => decodeURIComponent(current.pathname.split("/").at(-1) ?? ""),
    }).pipe(Effect.catch(() => Effect.succeed("download")))
    const name = yield* sanitizeFileName(rawName).pipe(
      Effect.catchTag("InvalidFileName", () => Effect.succeed("download")),
    )
    const headerType = response.headers.get("content-type")?.split(";")[0]?.trim()
    const contentType = headerType === undefined || headerType === ""
      ? yield* contentTypeFromName(name)
      : headerType
    return { bytes, contentType, name }
  }
  return yield* new StorageError({ message: "Too many redirects" })
})
