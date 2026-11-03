import * as Effect from "effect/Effect"

// Adds a numeric suffix so two uploads in the same folder can share a display name.
export const uniqueName = Effect.fnUntraced(function*(name: string, used: ReadonlySet<string>) {
  if (!used.has(name)) {
    return name
  }
  const dot = name.lastIndexOf(".")
  const stem = dot > 0 ? name.slice(0, dot) : name
  const extension = dot > 0 ? name.slice(dot) : ""
  let index = 2
  while (used.has(`${stem}-${index}${extension}`)) {
    index += 1
  }
  return `${stem}-${index}${extension}`
})
