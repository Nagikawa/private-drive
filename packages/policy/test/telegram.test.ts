import * as Vitest from '@effect/vitest';
import * as Effect from 'effect/Effect';

import { telegramChatUrl } from '../src/telegram.ts';

const token = '123456789:AAHexample-token';

Vitest.describe('telegramChatUrl', () => {
	// Supergroups and public usernames become a chat link. Media preview has no URL of its own.
	Vitest.it.effect('links a supergroup or public username and skips other ids', () =>
		Effect.gen(function* () {
			Vitest.expect(yield* telegramChatUrl('-1001234567890')).toBe('https://t.me/c/1234567890');
			Vitest.expect(yield* telegramChatUrl('  -1001234567890  ')).toBe('https://t.me/c/1234567890');
			Vitest.expect(yield* telegramChatUrl('https://t.me/c/1234567890/')).toBe(
				'https://t.me/c/1234567890',
			);
			Vitest.expect(yield* telegramChatUrl('@private_drive')).toBe('https://t.me/private_drive');
			Vitest.expect(yield* telegramChatUrl('t.me/private_drive')).toBe(
				'https://t.me/private_drive',
			);
			Vitest.expect(yield* telegramChatUrl('https://telegram.me/private_drive/')).toBe(
				'https://t.me/private_drive',
			);
			Vitest.expect(yield* telegramChatUrl('private_drive')).toBe('https://t.me/private_drive');
			Vitest.expect(yield* telegramChatUrl('-498765432')).toBeUndefined();
			Vitest.expect(yield* telegramChatUrl('123456789')).toBeUndefined();
			Vitest.expect(yield* telegramChatUrl('-100')).toBeUndefined();
			Vitest.expect(yield* telegramChatUrl(`${token}`)).toBeUndefined();
			Vitest.expect(yield* telegramChatUrl('https://t.me/c/1234567890?media')).toBeUndefined();
			const supergroup = yield* telegramChatUrl('-1001234567890');
			Vitest.expect(supergroup).not.toContain(token);
			Vitest.expect(supergroup).not.toContain('openmessage');
			Vitest.expect(supergroup).not.toContain('media');
		}),
	);
});
