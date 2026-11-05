import * as Vitest from '@effect/vitest';
import * as Effect from 'effect/Effect';

import { fileId, readFileId } from '../src/utils/file-id.ts';

Vitest.describe('fileId', () => {
	// A key with slashes stays one URL segment, and round-trips to the same source and key.
	Vitest.it.effect('round-trips a storage key', () =>
		Effect.sync(() => {
			const id = fileId('r2', 'img/photo.jpeg');
			Vitest.expect(id.includes('/')).toBe(false);
			Vitest.expect(readFileId(id)).toEqual({ key: 'img/photo.jpeg', source: 'r2' });
		}),
	);

	// An old catalog uuid, or a truncated token, is not a stored object.
	Vitest.it.effect('rejects an id that is not a source and key', () =>
		Effect.sync(() => {
			Vitest.expect(readFileId('missing')).toBeUndefined();
			Vitest.expect(readFileId('%%%')).toBeUndefined();
		}),
	);
});
