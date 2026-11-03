import * as Effect from "effect/Effect"
import { DownloadUrlError } from "../errors.ts"

// Rejects loopback, link-local, and private ranges so a URL upload cannot target the host network.
export const blockedAddress = Effect.fnUntraced(function*(address: string) {
  const normalized = address.toLowerCase()
  if (normalized === "::1" || normalized === "0.0.0.0") {
    return true
  }
  if (normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe80")) {
    return true
  }
  const parts = normalized.split(".").map((part) => Number(part))
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) {
    return false
  }
  const [first, second] = parts
  return first === 10 || first === 127 || first === 0 || (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) || (first === 192 && second === 168) ||
    (first === 100 && second >= 64 && second <= 127)
})

// True when the host is already an address, so a literal private IP can be refused without DNS.
const looksLikeIp = (host: string): boolean => {
  if (host.includes(":")) {
    return true
  }
  const parts = host.split(".")
  return parts.length === 4 && parts.every((part) => part !== "" && [...part].every((char) => char >= "0" && char <= "9"))
}

// Checks scheme, credentials, and literal private addresses before a download is followed.
export const inspectDownloadUrl = Effect.fnUntraced(function*(rawUrl: string) {
  const current = yield* Effect.try({
    try: () => new URL(rawUrl),
    catch: () => new DownloadUrlError({ message: "Invalid URL" }),
  })
  if (current.protocol !== "https:" && current.protocol !== "http:") {
    return yield* new DownloadUrlError({ message: "Only http or https URLs are accepted" })
  }
  if (current.username !== "" || current.password !== "") {
    return yield* new DownloadUrlError({ message: "URLs with credentials are not accepted" })
  }
  const host = current.hostname.replace(/^\[|\]$/g, "")
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) {
    return yield* new DownloadUrlError({ message: "Private network URLs are not accepted" })
  }
  if (looksLikeIp(host) && (yield* blockedAddress(host))) {
    return yield* new DownloadUrlError({ message: "Private network URLs are not accepted" })
  }
  return current
})
