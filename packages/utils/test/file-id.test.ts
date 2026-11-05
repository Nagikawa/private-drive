import * as Vitest from '@effect/vitest';
import * as Effect from 'effect/Effect';

import { fileId, readFileId } from '../src/file-id.ts';

Vitest.describe('fileId', () => {
	// A key with slashes stays one URL segment, and round-trips to the same source and key.
	Vitest.it.effect('round-trips a storage key', () =>
		Effect.gen(function* () {
			const id = yield* fileId('r2', 'img/photo.jpeg');
			Vitest.expect(id.includes('/')).toBe(false);
			Vitest.expect(yield* readFileId(id)).toEqual({ key: 'img/photo.jpeg', source: 'r2' });
		}),
	);

	// An old catalog uuid, or a truncated token, is not a stored object.
	Vitest.it.effect('rejects an id that is not a source and key', () =>
		Effect.gen(function* () {
			Vitest.expect(yield* readFileId('missing')).toBeUndefined();
			Vitest.expect(yield* readFileId('%%%')).toBeUndefined();
		}),
	);
});
