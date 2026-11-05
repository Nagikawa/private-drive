import * as Vitest from '@effect/vitest';
import * as Effect from 'effect/Effect';
import * as Stream from 'effect/Stream';

import type { HuggingFace } from '../src/storage/huggingface.ts';

import { huggingfaceStore } from '../src/storage/huggingface-store.ts';

const log: Array<string> = [];

const huggingface = {
	configured: true,
	delete: (key: string) =>
		Effect.sync(() => {
			log.push(`delete ${key}`);
		}),
	get: (key: string) =>
		Effect.sync(() => {
			log.push(`get ${key}`);
			return new Uint8Array([1]);
		}),
	list: () => Effect.succeed({ files: [], folders: [], truncated: false }),
	open: () => Effect.succeed(Stream.empty),
	put: (key: string, bytes: Uint8Array) =>
		Effect.sync(() => {
			log.push(`put ${key} ${bytes.byteLength}`);
		}),
	putFile: (key: string) =>
		Effect.sync(() => {
			log.push(`putFile ${key}`);
		}),
	status: () => Effect.succeed('repo'),
} as HuggingFace['Service'];

Vitest.describe('huggingfaceStore', () => {
	// The dataset API has no copy, so a rename downloads the bytes and writes them under the new key.
	Vitest.it.effect('rewrites an object under the new key', () =>
		Effect.gen(function* () {
			log.length = 0;
			const store = huggingfaceStore(huggingface);
			Vitest.expect(yield* store.relocate('old', 'new')).toBe('new');
			Vitest.expect(log).toEqual(['get old', 'put new 1', 'delete old']);
		}),
	);
});
