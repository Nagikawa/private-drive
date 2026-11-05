// S3 and R2 reject every part but the last when it is under 5 MiB, and they allow at most 10,000 parts.
const minPartBytes = 8 * 1024 * 1024
const maxPartCount = 10_000
const mebibyte = 1024 * 1024

// One browser request. The server stores it and the next request continues after it.
export const uploadChunkBytes = 8 * mebibyte

// Picks a part size that stays within the part count and the minimum part size.
export const uploadPartBytes = (fileSize: number): number => {
  if (!Number.isFinite(fileSize) || fileSize <= 0) {
    return minPartBytes
  }
  const needed = Math.ceil(fileSize / maxPartCount)
  const aligned = Math.ceil(needed / mebibyte) * mebibyte
  return Math.max(minPartBytes, aligned)
}

export interface UploadPart {
  readonly length: number
  readonly number: number
  readonly offset: number
}

// Splits a file into contiguous 1-based ranges. An empty or invalid size uploads as no parts.
export const uploadParts = (fileSize: number, partBytes: number): ReadonlyArray<UploadPart> => {
  if (
    !Number.isFinite(fileSize) ||
    fileSize <= 0 ||
    !Number.isFinite(partBytes) ||
    partBytes <= 0
  ) {
    return []
  }
  const parts: Array<UploadPart> = []
  let offset = 0
  let number = 1
  while (offset < fileSize) {
    const length = Math.min(partBytes, fileSize - offset)
    parts.push({ length, number, offset })
    offset += length
    number += 1
  }
  return parts
}
