import * as Vitest from '@effect/vitest';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import { FileEntry, LoginPayload, OpenUpload, SourceId, SourceStatus } from '../src/model.ts';

Vitest.describe('domain models', () => {
	// A fractional size is not a stored byte count.
	Vitest.it.effect('decodes a file and rejects a fractional upload size', () =>
		Effect.gen(function* () {
			const file = yield* Schema.decodeUnknownEffect(FileEntry)({
				contentType: 'text/plain',
				createdAt: '2026-01-01T00:00:00.000Z',
				folder: '',
				id: '1',
				image: false,
				name: 'a.txt',
				size: 1,
				source: 'r2',
			});
			Vitest.expect(file.name).toBe('a.txt');
			const size = yield* Schema.decodeUnknownEffect(OpenUpload)({
				contentType: 'text/plain',
				folder: '',
				name: 'a.txt',
				size: 1.5,
				source: 'r2',
			}).pipe(Effect.result);
			Vitest.expect(size._tag).toBe('Failure');
			const source = yield* Schema.decodeUnknownEffect(SourceId)('telegram');
			Vitest.expect(source).toBe('telegram');
			const login = yield* Schema.decodeUnknownEffect(LoginPayload)({ password: 'admin' });
			Vitest.expect(login.password).toBe('admin');
		}),
	);

	// The chat address is optional so sources without a public link still decode.
	Vitest.it.effect('decodes a source status with or without a url', () =>
		Effect.gen(function* () {
			const linked = yield* Schema.decodeUnknownEffect(SourceStatus)({
				connected: true,
				detail: 'Connected @bot',
				id: 'telegram',
				label: 'Telegram',
				url: 'https://t.me/c/1234567890',
			});
			Vitest.expect(linked.url).toBe('https://t.me/c/1234567890');
			const plain = yield* Schema.decodeUnknownEffect(SourceStatus)({
				connected: false,
				detail: 'Not configured',
				id: 'r2',
				label: 'Cloudflare R2',
			});
			Vitest.expect(plain.url).toBeUndefined();
		}),
	);
});
