import * as Vitest from '@effect/vitest';
import * as Effect from 'effect/Effect';

import { normalizeFolder, sanitizeFileName } from '../src/paths.ts';

Vitest.describe('normalizeFolder', () => {
	// Collapses slashes and trims a normal folder.
	Vitest.it.effect('keeps a nested folder', () =>
		Effect.gen(function* () {
			const folder = yield* normalizeFolder(' /photos/trip/ ');
			Vitest.expect(folder).toBe('photos/trip');
		}),
	);

	// An empty input is Root, which the drive stores as an empty path.
	Vitest.it.effect('treats a blank path as Root', () =>
		Effect.gen(function* () {
			const folder = yield* normalizeFolder(' / ');
			Vitest.expect(folder).toBe('');
		}),
	);

	// Parent segments are a tagged failure, not an exception.
	Vitest.it.effect('rejects a path that leaves the drive', () =>
		Effect.gen(function* () {
			const message = yield* normalizeFolder('photos/../secret').pipe(
				Effect.match({
					onFailure: (error) => error.message,
					onSuccess: () => '',
				}),
			);
			Vitest.expect(message).toBe('Invalid folder path');
		}),
	);
});

Vitest.describe('sanitizeFileName', () => {
	// Drops the directory and keeps the final segment.
	Vitest.it.effect('keeps the file name', () =>
		Effect.gen(function* () {
			const name = yield* sanitizeFileName('photos/cat.jpg');
			Vitest.expect(name).toBe('cat.jpg');
		}),
	);

	// The folder marker is not a file the user can upload.
	Vitest.it.effect('rejects the folder marker', () =>
		Effect.gen(function* () {
			const message = yield* sanitizeFileName('.keep').pipe(
				Effect.match({
					onFailure: (error) => error.message,
					onSuccess: () => '',
				}),
			);
			Vitest.expect(message).toBe('Invalid file name');
		}),
	);
});
