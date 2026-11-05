import * as Vitest from '@effect/vitest';
import * as Effect from 'effect/Effect';

import { namesInFolder, uniqueName } from '../src/names.ts';

Vitest.describe('namesInFolder', () => {
	// The empty-folder marker is not a name the next upload has to avoid.
	Vitest.it.effect('lists display names and skips the marker', () =>
		Effect.gen(function* () {
			const names = yield* namesInFolder(
				{
					files: [
						{ contentType: 'text/plain', key: 'photos/.keep', size: 0 },
						{ contentType: 'image/jpeg', key: 'photos/cat.jpg', size: 1 },
						{ contentType: 'image/jpeg', key: 'other/dog.jpg', size: 1 },
					],
					folders: [],
					truncated: false,
				},
				'photos',
			);
			Vitest.expect([...names]).toEqual(['cat.jpg']);
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
