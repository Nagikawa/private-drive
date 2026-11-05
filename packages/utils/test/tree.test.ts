import * as Vitest from '@effect/vitest';
import * as Effect from 'effect/Effect';

import { folderCrumbs, folderTree } from '../src/tree.ts';

Vitest.describe('folderCrumbs', () => {
	// Root has no extra crumbs because the screen already shows a Root button.
	Vitest.it.effect('returns nothing for Root', () =>
		Effect.gen(function* () {
			Vitest.expect(yield* folderCrumbs('')).toEqual([]);
		}),
	);

	// Each segment links to the path accumulated so far.
	Vitest.it.effect('splits a nested folder', () =>
		Effect.gen(function* () {
			Vitest.expect(yield* folderCrumbs('photos/trip')).toEqual([
				{ name: 'photos', path: 'photos' },
				{ name: 'trip', path: 'photos/trip' },
			]);
		}),
	);
});

Vitest.describe('folderTree', () => {
	// A deep path grows the missing parents so the sidebar has somewhere to hang it.
	Vitest.it.effect('fills missing parents', () =>
		Effect.gen(function* () {
			const tree = yield* folderTree([{ path: 'photos/trip' }]);
			Vitest.expect(tree).toEqual([
				{
					children: [{ children: [], name: 'trip', path: 'photos/trip' }],
					name: 'photos',
					path: 'photos',
				},
			]);
		}),
	);
});
