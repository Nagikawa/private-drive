import * as Vitest from '@effect/vitest';
import * as Effect from 'effect/Effect';

import { unavailable } from '../src/source.ts';

Vitest.describe('unavailable', () => {
	// A missing provider fails with the label the screen already shows.
	Vitest.it.effect('names the source that is not configured', () =>
		Effect.gen(function* () {
			const message = yield* unavailable('telegram').pipe(
				Effect.match({
					onFailure: (error) => error.message,
					onSuccess: () => '',
				}),
			);
			Vitest.expect(message).toContain('Telegram');
		}),
	);
});
