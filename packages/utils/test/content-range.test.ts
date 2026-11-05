import * as Vitest from '@effect/vitest';
import * as Effect from 'effect/Effect';

import { contentRange } from '../src/content-range.ts';

Vitest.describe('contentRange', () => {
	// The client names the next byte window in the header the upload route requires.
	Vitest.it.effect('reads a byte range and rejects a missing one', () =>
		Effect.gen(function* () {
			Vitest.expect(yield* contentRange('bytes 0-7/20')).toEqual({ end: 7, start: 0, total: 20 });
			const message = yield* contentRange('').pipe(
				Effect.match({
					onFailure: (error) => error.message,
					onSuccess: () => '',
				}),
			);
			Vitest.expect(message).toBe('Content-Range is required');
		}),
	);
});
