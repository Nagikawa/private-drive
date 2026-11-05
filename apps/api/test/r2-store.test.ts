import * as Vitest from '@effect/vitest';
import * as Effect from 'effect/Effect';
import * as Stream from 'effect/Stream';

import type { R2 } from '../src/storage/r2.ts';

import { r2Store } from '../src/storage/r2-store.ts';

const log: Array<string> = [];

const r2 = {
	configured: true,
	copy: (from: string, to: string) =>
		Effect.sync(() => {
			log.push(`copy ${from} ${to}`);
		}),
	delete: (key: string) =>
		Effect.sync(() => {
			log.push(`delete ${key}`);
		}),
	get: () => Effect.succeed(new Uint8Array()),
	list: () => Effect.succeed({ files: [], folders: [], truncated: false }),
	open: () => Effect.succeed(Stream.empty),
	put: (key: string) =>
		Effect.sync(() => {
			log.push(`put ${key}`);
		}),
	putFile: (key: string) =>
		Effect.sync(() => {
			log.push(`putFile ${key}`);
		}),
	status: () => Effect.succeed('bucket'),
} as R2['Service'];

Vitest.describe('r2Store', () => {
	// A rename copies the object and only then removes the old key.
	Vitest.it.effect('copies to the new key and returns it', () =>
		Effect.gen(function* () {
			log.length = 0;
			const store = r2Store(r2);
			Vitest.expect(yield* store.relocate('old', 'new')).toBe('new');
			Vitest.expect(log).toEqual(['copy old new', 'delete old']);
			Vitest.expect(yield* store.relocate('same', 'same')).toBe('same');
			Vitest.expect(log).toEqual(['copy old new', 'delete old']);
		}),
	);

	// An empty folder is a marker object, not a directory entry.
	Vitest.it.effect('writes and removes the folder marker', () =>
		Effect.gen(function* () {
			log.length = 0;
			const store = r2Store(r2);
			yield* store.putMarker('img');
			yield* store.deleteMarker('img');
			const placed = yield* store.putFile('img/a.txt', '/tmp/a', 1, 'text/plain');
			Vitest.expect(placed).toEqual({ storageKey: 'img/a.txt', telegramMessageId: undefined });
			Vitest.expect(log).toEqual(['put img/.keep', 'delete img/.keep', 'putFile img/a.txt']);
		}),
	);
});
