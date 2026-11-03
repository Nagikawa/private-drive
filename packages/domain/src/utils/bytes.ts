import * as Effect from "effect/Effect"

// Formats a byte count for the file list without pulling in a locale library.
export const formatBytes = Effect.fnUntraced(function*(size: number) {
  if (size < 1024) {
    return `${size} B`
  }
  const units = ["KB", "MB", "GB"]
  let value = size / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`
})
