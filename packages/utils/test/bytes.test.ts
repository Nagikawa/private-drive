import * as Vitest from '@effect/vitest';
import * as Effect from 'effect/Effect';

import { bytesOf, formatBytes } from '../src/bytes.ts';

Vitest.describe('formatBytes', () => {
	// Small files stay in bytes.
	Vitest.it.effect('formats bytes', () =>
		Effect.gen(function* () {
			Vitest.expect(yield* formatBytes(512)).toBe('512 B');
		}),
	);

	// Larger files pick a unit and drop the decimal once the number is wide.
	Vitest.it.effect('formats kilobytes and megabytes', () =>
		Effect.gen(function* () {
			Vitest.expect(yield* formatBytes(1536)).toBe('1.5 KB');
			Vitest.expect(yield* formatBytes(10 * 1024)).toBe('10 KB');
			Vitest.expect(yield* formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
			Vitest.expect(yield* bytesOf(new Uint8Array(4))).toBe(4);
		}),
	);
});
