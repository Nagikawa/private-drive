import { Effect } from "effect"
import { keepName, labels, limits } from "./shared.ts"
import type { FileStore } from "./file-store.ts"
import type { HuggingFace } from "./huggingface.ts"

// Adapts the dataset client. A rename still downloads and uploads because the API has no copy.
export const huggingfaceStore = (huggingface: HuggingFace["Service"]): FileStore => ({
  byteLimit: limits.huggingface,
  configured: huggingface.configured,
  id: "huggingface",
  label: labels.huggingface,
  listsRemotely: true,
  deleteMarker: (folder) => huggingface.delete(`${folder}/${keepName}`),
  list: (folder, recursive) => huggingface.list(folder, recursive),
  open: (storageKey) => huggingface.open(storageKey),
  putFile: (key, path, size) =>
    huggingface
      .putFile(key, path, size)
      .pipe(Effect.as({ storageKey: key, telegramMessageId: undefined })),
  putMarker: (folder) => huggingface.put(`${folder}/${keepName}`, new Uint8Array()),
  relocate: (fromKey, toKey) => {
    if (fromKey === toKey) {
      return Effect.succeed(toKey)
    }
    return huggingface.get(fromKey).pipe(
      Effect.flatMap((bytes) => huggingface.put(toKey, bytes)),
      Effect.flatMap(() => huggingface.delete(fromKey)),
      Effect.as(toKey),
    )
  },
  remove: (storageKey) => huggingface.delete(storageKey),
  status: () => huggingface.status(),
})
