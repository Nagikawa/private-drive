import { createHmac, timingSafeEqual } from "node:crypto"

// A copied link stays valid for one hour, then the content route rejects it.
export const shareLifetime = 60 * 60 * 1000

export const signContent = (secret: string, id: string, expiresAt: number): string =>
  createHmac("sha256", secret).update(`${id}.${expiresAt}`).digest("base64url")

// Accepts a link when the signature matches this file and the expiry is still ahead.
export const contentSignatureValid = (
  secret: string,
  id: string,
  expiresText: string,
  signature: string,
  now: number,
): boolean => {
  const expiresAt = Number(expiresText)
  if (!Number.isFinite(expiresAt) || expiresAt <= now || signature === "") {
    return false
  }
  const expected = signContent(secret, id, expiresAt)
  const actual = Buffer.from(signature)
  const wanted = Buffer.from(expected)
  return actual.length === wanted.length && timingSafeEqual(actual, wanted)
}
