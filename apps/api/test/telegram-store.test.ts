import * as Vitest from '@effect/vitest';
import * as Effect from 'effect/Effect';
import * as Stream from 'effect/Stream';

import type { Telegram } from '../src/storage/telegram.ts';

import { telegramStore } from '../src/storage/telegram-store.ts';

const deleted: Array<number> = [];

const telegram = {
	configured: true,
	deleteMessage: (messageId: number) =>
		Effect.sync(() => {
			deleted.push(messageId);
		}),
	get: () => Effect.succeed(new Uint8Array()),
	open: () => Effect.succeed(Stream.empty),
	put: () => Effect.succeed({ messageId: 8.9, storageKey: 'file-id' }),
	status: () => Effect.succeed('@bot'),
} as Telegram['Service'];

Vitest.describe('telegramStore', () => {
	// The chat is not a folder tree, so listing and moving must not invent remote paths.
	Vitest.it.effect('keeps the file id and does not list or mark folders', () =>
		Effect.gen(function* () {
			const store = telegramStore(telegram);
			Vitest.expect(store.listsRemotely).toBe(false);
			Vitest.expect(yield* store.list('', false)).toEqual({
				files: [],
				folders: [],
				truncated: false,
			});
			Vitest.expect(yield* store.relocate('file-id', 'img/a.txt')).toBe('file-id');
			yield* store.putMarker('img');
			yield* store.deleteMarker('img');
			const placed = yield* store.putFile('img/a.txt', '/tmp/a', 1, 'text/plain');
			Vitest.expect(placed).toEqual({ storageKey: 'file-id', telegramMessageId: 8 });
		}),
	);

	// A row without a message id, or a bot that is not configured, has nothing to delete.
	Vitest.it.effect('deletes the chat message only when the id and the bot are present', () =>
		Effect.gen(function* () {
			deleted.length = 0;
			const store = telegramStore(telegram);
			yield* store.remove('file-id', undefined);
			yield* store.remove('file-id', 4);
			Vitest.expect(deleted).toEqual([4]);
			const offline = telegramStore({ ...telegram, configured: false });
			yield* offline.remove('file-id', 9);
			Vitest.expect(deleted).toEqual([4]);
		}),
	);
});
