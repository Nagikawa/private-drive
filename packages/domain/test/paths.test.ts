import * as Vitest from '@effect/vitest';
import * as Effect from 'effect/Effect';

import {
	folderName,
	isDirectChildFolder,
	isWithinFolder,
	joinFolder,
	parentFolder,
	splitStorageKey,
	storageKey,
} from '../src/utils/paths.ts';

Vitest.describe('parentFolder', () => {
	// A nested path points at the folder above it.
	Vitest.it.effect('returns the parent', () =>
		Effect.gen(function* () {
			Vitest.expect(yield* parentFolder('photos/trip')).toBe('photos');
		}),
	);

	// A top-level folder's parent is Root.
	Vitest.it.effect('returns Root for a top-level folder', () =>
		Effect.gen(function* () {
			Vitest.expect(yield* parentFolder('photos')).toBe('');
		}),
	);
});

Vitest.describe('folderName', () => {
	// Labels use the last segment.
	Vitest.it.effect('returns the last segment', () =>
		Effect.gen(function* () {
			Vitest.expect(yield* folderName('photos/trip')).toBe('trip');
		}),
	);

	// A top-level folder is its own label.
	Vitest.it.effect('returns a top-level name unchanged', () =>
		Effect.gen(function* () {
			Vitest.expect(yield* folderName('photos')).toBe('photos');
		}),
	);
});

Vitest.describe('joinFolder', () => {
	// Root stays an empty path, so the child is the whole key.
	Vitest.it.effect('joins onto Root without a leading slash', () =>
		Effect.gen(function* () {
			Vitest.expect(yield* joinFolder('', 'cat.jpg')).toBe('cat.jpg');
		}),
	);

	// A nested folder keeps a single slash between the parts.
	Vitest.it.effect('joins a child under a folder', () =>
		Effect.gen(function* () {
			Vitest.expect(yield* joinFolder('photos', 'cat.jpg')).toBe('photos/cat.jpg');
		}),
	);
});

Vitest.describe('storageKey', () => {
	// The object key uses the same join rules as the folder shown in the UI.
	Vitest.it.effect('builds a key from a folder and a name', () =>
		Effect.gen(function* () {
			Vitest.expect(yield* storageKey('photos', 'cat.jpg')).toBe('photos/cat.jpg');
		}),
	);
});

Vitest.describe('splitStorageKey', () => {
	// A nested key splits into the folder the UI shows and the file name.
	Vitest.it.effect('splits a nested key', () =>
		Effect.gen(function* () {
			Vitest.expect(yield* splitStorageKey('photos/cat.jpg')).toEqual({
				folder: 'photos',
				name: 'cat.jpg',
			});
		}),
	);

	// A key with no slash lives at Root.
	Vitest.it.effect('puts a bare name at Root', () =>
		Effect.gen(function* () {
			Vitest.expect(yield* splitStorageKey('cat.jpg')).toEqual({ folder: '', name: 'cat.jpg' });
		}),
	);
});

Vitest.describe('isDirectChildFolder', () => {
	// A non-recursive listing shows only the next level.
	Vitest.it.effect('accepts one level under the parent', () =>
		Effect.gen(function* () {
			Vitest.expect(yield* isDirectChildFolder('photos', 'photos/trip')).toBe(true);
		}),
	);

	// A grandchild belongs in a recursive listing, not a direct one.
	Vitest.it.effect('rejects a grandchild', () =>
		Effect.gen(function* () {
			Vitest.expect(yield* isDirectChildFolder('photos', 'photos/trip/day')).toBe(false);
		}),
	);
});

Vitest.describe('isWithinFolder', () => {
	// The folder itself and its descendants stay in a recursive listing.
	Vitest.it.effect('includes the folder and a descendant', () =>
		Effect.gen(function* () {
			Vitest.expect(yield* isWithinFolder('photos', 'photos')).toBe(true);
			Vitest.expect(yield* isWithinFolder('photos', 'photos/trip')).toBe(true);
		}),
	);

	// A sibling folder is outside the scope.
	Vitest.it.effect('excludes a sibling', () =>
		Effect.gen(function* () {
			Vitest.expect(yield* isWithinFolder('photos', 'video')).toBe(false);
		}),
	);

	// Root contains every path.
	Vitest.it.effect('treats Root as the whole drive', () =>
		Effect.gen(function* () {
			Vitest.expect(yield* isWithinFolder('', 'photos/trip')).toBe(true);
		}),
	);
});
