import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

// One place for the JSON documents and temporary bytes that used to live on disk.
export class StateError extends Schema.TaggedError<StateError>()('StateError', {
	message: Schema.String,
}) {}

export class StateStore extends Context.Service<
	StateStore,
	{
		readonly appendDoc: (key: string, line: string) => Effect.Effect<void, StateError>;
		readonly compareAndSwap: (
			key: string,
			expected: string | undefined,
			next: string,
		) => Effect.Effect<'ok' | 'conflict', StateError>;
		readonly list: (prefix: string) => Effect.Effect<ReadonlyArray<string>, StateError>;
		readonly readAt: (
			path: string,
			offset: number,
			length: number,
		) => Effect.Effect<Uint8Array, StateError>;
		readonly readDoc: (key: string) => Effect.Effect<string | undefined, StateError>;
		readonly remove: (path: string) => Effect.Effect<void, StateError>;
		readonly removePrefix: (prefix: string) => Effect.Effect<void, StateError>;
		readonly rename: (from: string, to: string) => Effect.Effect<void, StateError>;
		readonly size: (path: string) => Effect.Effect<number | undefined, StateError>;
		readonly writeAt: (
			path: string,
			offset: number,
			bytes: Uint8Array,
		) => Effect.Effect<void, StateError>;
	}
>()('private-drive/StateStore') {}

// Rewrites one document only when nobody else changed it since it was read.
export const swapDoc = Effect.fn('StateStore.swapDoc')(function* (
	key: string,
	use: (current: string | undefined) => string,
) {
	const store = yield* StateStore;
	for (let attempt = 0; attempt < 8; attempt++) {
		const current = yield* store.readDoc(key);
		const swapped = yield* store.compareAndSwap(key, current, use(current));
		if (swapped === 'ok') {
			return;
		}
	}
	return yield* new StateError({ message: 'Could not update stored state' });
});
