import * as Vitest from '@effect/vitest';
import * as Effect from 'effect/Effect';

import { isFileSort, parseFileSort } from './file-sort';

Vitest.describe('file sort', () => {
	// The select value is one token. The list request wants the field and the direction apart.
	Vitest.it.effect('splits a known sort and rejects anything else', () =>
		Effect.sync(() => {
			Vitest.expect(parseFileSort('created-desc')).toEqual({ sort: 'created', order: 'desc' });
			Vitest.expect(parseFileSort('type-asc')).toEqual({ sort: 'type', order: 'asc' });
			Vitest.expect(isFileSort('size-desc')).toBe(true);
			Vitest.expect(isFileSort('recent')).toBe(false);
		}),
	);
});
