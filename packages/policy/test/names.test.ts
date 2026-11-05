import * as Vitest from '@effect/vitest';
import * as Effect from 'effect/Effect';

import { nameKeepingType } from '../src/names.ts';

Vitest.describe('nameKeepingType', () => {
	// A typed extension is discarded so the stored file type stays the original one.
	Vitest.it.effect('keeps the original extension when the request names another type', () =>
		Effect.gen(function* () {
			Vitest.expect(yield* nameKeepingType('IMG_3007.jpeg', '001.png')).toBe('001.jpeg');
		}),
	);

	// A request with no extension still receives the stored type.
	Vitest.it.effect('adds the original extension when the request has none', () =>
		Effect.gen(function* () {
			Vitest.expect(yield* nameKeepingType('IMG_3007.jpeg', '001')).toBe('001.jpeg');
		}),
	);
});
