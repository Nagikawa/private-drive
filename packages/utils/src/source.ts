import { labels, StorageError, type SourceId } from '@private-drive/model';
import * as Effect from 'effect/Effect';

// Explains a missing provider with the same message the routes already show to the client.
export const unavailable = Effect.fnUntraced(function* (source: SourceId) {
	return yield* new StorageError({ message: `${labels[source]} is not set in the environment` });
});
