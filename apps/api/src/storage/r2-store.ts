import { Effect } from "effect"
import { keepName, labels, limits } from "./shared.ts"
import type { FileStore } from "./file-store.ts"
import type { R2 } from "./r2.ts"

// Adapts the R2 client to the store Drive calls. Bucket commands stay in the R2 service.
export const r2Store = (r2: R2["Service"]): FileStore => ({
  byteLimit: limits.r2,
  configured: r2.configured,
  id: "r2",
  label: labels.r2,
  listsRemotely: true,
  deleteMarker: (folder) => r2.delete(`${folder}/${keepName}`),
  list: (folder, recursive) => r2.list(folder, recursive),
  open: (storageKey) => r2.open(storageKey),
  putFile: (key, path, size, contentType) =>
    r2.putFile(key, path, size, contentType).pipe(
      Effect.as({ storageKey: key, telegramMessageId: undefined }),
    ),
  putMarker: (folder) => r2.put(`${folder}/${keepName}`, new Uint8Array(), "application/octet-stream"),
  relocate: (fromKey, toKey) => {
    if (fromKey === toKey) {
      return Effect.succeed(toKey)
    }
    return r2.copy(fromKey, toKey).pipe(
      Effect.flatMap(() => r2.delete(fromKey)),
      Effect.as(toKey),
    )
  },
  remove: (storageKey) => r2.delete(storageKey),
  status: () => r2.status(),
})
