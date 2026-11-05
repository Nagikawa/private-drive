import { Effect } from "effect"
import { labels, limits, type RemoteListing } from "./shared.ts"
import type { FileStore } from "./file-store.ts"
import type { Telegram } from "./telegram.ts"

const emptyListing: RemoteListing = { files: [], folders: [], truncated: false }

// Adapts the bot client. The chat cannot be listed or addressed by folder path, so those operations do not invent remote state.
export const telegramStore = (telegram: Telegram["Service"]): FileStore => ({
  byteLimit: limits.telegram,
  configured: telegram.configured,
  id: "telegram",
  label: labels.telegram,
  listsRemotely: false,
  deleteMarker: () => Effect.void,
  list: () => Effect.succeed(emptyListing),
  open: (storageKey) => telegram.open(storageKey),
  putFile: (key, path, _size, contentType) =>
    telegram.put(key, path, contentType).pipe(
      Effect.map((stored) => ({
        storageKey: stored.storageKey,
        telegramMessageId:
          stored.messageId === undefined ? undefined : Math.trunc(stored.messageId),
      })),
    ),
  putMarker: () => Effect.void,
  relocate: (fromKey) => Effect.succeed(fromKey),
  remove: (_storageKey, telegramMessageId) => {
    if (telegramMessageId === undefined || !telegram.configured) {
      return Effect.void
    }
    return telegram.deleteMessage(telegramMessageId)
  },
  status: () => telegram.status(),
})
