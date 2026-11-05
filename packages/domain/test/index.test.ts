import * as Vitest from '@effect/vitest';
import * as Effect from 'effect/Effect';

import { Api, formatBytes, pageFiles } from '../src/index.ts';

Vitest.describe('domain entry', () => {
	// The package entry re-exports the helpers the API and the web app import.
	Vitest.it.effect('exposes paging, byte labels, and the HTTP contract', () =>
		Effect.gen(function* () {
			Vitest.expect(pageFiles([], { order: 'asc', sort: 'name' }).files).toEqual([]);
			Vitest.expect(yield* formatBytes(0)).toBe('0 B');
			Vitest.expect(Api).toBeDefined();
		}),
	);
});
