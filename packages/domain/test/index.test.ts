import * as Vitest from '@effect/vitest';
import * as Effect from 'effect/Effect';

import { Api, Session } from '../src/index.ts';

Vitest.describe('domain entry', () => {
	// The package entry exposes the HTTP contract and the session marker.
	Vitest.it.effect('exposes the API and the session', () =>
		Effect.sync(() => {
			Vitest.expect(Api).toBeDefined();
			Vitest.expect(Session).toBeDefined();
		}),
	);
});
