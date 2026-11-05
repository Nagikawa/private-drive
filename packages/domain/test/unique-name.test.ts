import * as Vitest from '@effect/vitest';
import * as Effect from 'effect/Effect';

import { nameKeepingType, uniqueName } from '../src/utils/names.ts';

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

Vitest.describe('uniqueName', () => {
	// The original name is kept when the folder does not already have it.
	Vitest.it.effect('keeps an unused name', () =>
		Effect.gen(function* () {
			Vitest.expect(yield* uniqueName('cat.jpg', new Set())).toBe('cat.jpg');
		}),
	);

	// A collision gets the next free numeric suffix before the extension.
	Vitest.it.effect('adds a suffix when the name is taken', () =>
		Effect.gen(function* () {
			Vitest.expect(yield* uniqueName('cat.jpg', new Set(['cat.jpg', 'cat-2.jpg']))).toBe(
				'cat-3.jpg',
			);
		}),
	);
});
