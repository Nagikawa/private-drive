import * as Vitest from '@effect/vitest';
import * as Effect from 'effect/Effect';

import { parentFolder } from '../src/utils/paths.ts';
import { pure } from '../src/utils/pure.ts';

Vitest.describe('pure', () => {
	// A successful helper returns its value without the caller yielding.
	Vitest.it.effect('reads a successful effect', () =>
		Effect.gen(function* () {
			Vitest.expect(pure(parentFolder('photos/trip'), '')).toBe('photos');
		}),
	);

	// A defect becomes the fallback instead of an exception at the sync boundary.
	Vitest.it.effect('returns the fallback when the effect dies', () =>
		Effect.gen(function* () {
			Vitest.expect(pure(Effect.die('boom'), 'fallback')).toBe('fallback');
		}),
	);
});
