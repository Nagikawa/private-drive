import * as Vitest from '@effect/vitest';
import * as Effect from 'effect/Effect';

import { activeSessions, pendingUploads, sessionBook, storedUploads } from '../src/records.ts';

Vitest.describe('stored records', () => {
	// A damaged journal does not throw. Rows that are not uploads are skipped.
	Vitest.it.effect('keeps valid rows and drops a corrupt file', () =>
		Effect.gen(function* () {
			const text = JSON.stringify([
				{
					contentType: 'text/plain',
					folder: '',
					id: '1',
					name: 'a.txt',
					offset: 0,
					path: '/tmp/1',
					size: 3,
					source: 'r2',
				},
				{ id: 'nope' },
			]);
			const rows = yield* storedUploads(text);
			Vitest.expect(rows.map((row) => row.id)).toEqual(['1']);
			Vitest.expect(yield* storedUploads('not-json')).toEqual([]);
			Vitest.expect(
				yield* pendingUploads(JSON.stringify([{ key: 'a', uploadId: 'u' }, { key: '' }])),
			).toEqual([{ key: 'a', uploadId: 'u' }]);
		}),
	);

	// Logout only needs nonces that have not expired.
	Vitest.it.effect('reads a session book and drops expired nonces', () =>
		Effect.gen(function* () {
			const book = yield* sessionBook(
				JSON.stringify({ sessions: { live: 20, bad: 'x', gone: 5 } }),
			);
			Vitest.expect(book).toEqual({ live: 20, gone: 5 });
			Vitest.expect(yield* activeSessions(book, 10)).toEqual({ live: 20 });
			Vitest.expect(yield* sessionBook('')).toEqual({});
		}),
	);
});
