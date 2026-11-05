import type { SourceId, StorageError } from '@private-drive/domain';

import * as Effect from 'effect/Effect';
import * as Stream from 'effect/Stream';

import type { RemoteListing } from './shared.ts';

// What a put returns. Telegram's key is a file id, not the folder path the caller asked for.
export interface PlacedObject {
	readonly storageKey: string;
	readonly telegramMessageId: number | undefined;
}

// The operations Drive needs from any source.
// A new source implements this and is registered once. Drive does not grow a branch for it.
// listsRemotely is false when the provider cannot enumerate objects. An empty list is then not "the folder is empty".
// relocate returns the key to store. A provider that does not address files by path returns the original key.
export interface FileStore {
	readonly byteLimit: number | undefined;
	readonly configured: boolean;
	readonly id: SourceId;
	readonly label: string;
	readonly listsRemotely: boolean;
	deleteMarker(folder: string): Effect.Effect<void, StorageError>;
	list(folder: string, recursive: boolean): Effect.Effect<RemoteListing, StorageError>;
	open(storageKey: string): Effect.Effect<Stream.Stream<Uint8Array, StorageError>, StorageError>;
	putFile(
		key: string,
		path: string,
		size: number,
		contentType: string,
	): Effect.Effect<PlacedObject, StorageError>;
	putMarker(folder: string): Effect.Effect<void, StorageError>;
	relocate(fromKey: string, toKey: string): Effect.Effect<string, StorageError>;
	remove(
		storageKey: string,
		telegramMessageId: number | undefined,
	): Effect.Effect<void, StorageError>;
	status(): Effect.Effect<string, StorageError>;
}
