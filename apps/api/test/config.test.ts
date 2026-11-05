import * as Vitest from '@effect/vitest';
import * as ConfigProvider from 'effect/ConfigProvider';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Redacted from 'effect/Redacted';

import { AppConfig } from '../src/config.ts';
import { configFor } from './support.ts';

Vitest.describe('AppConfig', () => {
	// A blank credential must not look configured, even when the other R2 fields are filled in.
	Vitest.it.effect('leaves a provider unset when any required field is blank', () =>
		Effect.gen(function* () {
			const config = yield* AppConfig;
			Vitest.expect(config.r2).toBeUndefined();
			Vitest.expect(config.telegram).toBeUndefined();
			Vitest.expect(config.huggingface).toBeUndefined();
			Vitest.expect(config.port).toBe(8787);
			Vitest.expect(config.dataDir).toBe('/tmp/private-drive-config');
			Vitest.expect(config.cookieSecure).toBe(false);
			Vitest.expect(Redacted.value(config.authPassword)).toBe('admin');
		}).pipe(
			Effect.provide(
				configFor('/tmp/private-drive-config', {
					HF_TOKEN: 'token',
					R2_ACCESS_KEY_ID: 'key',
					R2_ACCOUNT_ID: ' ',
					R2_BUCKET: 'bucket',
					R2_SECRET_ACCESS_KEY: 'secret',
					TG_BOT_TOKEN: 'token',
				}),
			),
		),
	);

	// All four R2 fields, and both fields of the other providers, turn those stores on.
	Vitest.it.effect('reads a complete provider', () =>
		Effect.gen(function* () {
			const config = yield* AppConfig;
			Vitest.expect(config.r2?.bucket).toBe('drive');
			Vitest.expect(config.telegram?.chatId).toBe('1');
			Vitest.expect(config.huggingface?.repo).toBe('owner/set');
			Vitest.expect(config.port).toBe(8791);
			Vitest.expect(config.dataDir).toBe('/tmp/private-drive-config');
			Vitest.expect(config.cookieSecure).toBe(true);
		}).pipe(
			Effect.provide(
				configFor('/tmp/private-drive-config', {
					COOKIE_SECURE: 'true',
					HF_REPO: 'owner/set',
					HF_TOKEN: 'token',
					PORT: '8791',
					R2_ACCESS_KEY_ID: 'key',
					R2_ACCOUNT_ID: 'account',
					R2_BUCKET: 'drive',
					R2_SECRET_ACCESS_KEY: 'secret',
					TG_BOT_TOKEN: 'token',
					TG_CHAT_ID: '1',
				}),
			),
		),
	);

	// An existing env file names the catalog file. The runtime files stay in that file's directory.
	Vitest.it.effect('uses the directory of INDEX_PATH when DATA_DIR is unset', () =>
		Effect.gen(function* () {
			const config = yield* AppConfig;
			Vitest.expect(config.dataDir).toBe('/tmp/private-drive-config');
		}).pipe(
			Effect.provide(
				AppConfig.layer.pipe(
					Layer.provide(
						ConfigProvider.layer(
							ConfigProvider.fromEnvRecord({
								AUTH_PASSWORD: 'admin',
								INDEX_PATH: '/tmp/private-drive-config/index.json',
								SESSION_SECRET: 'test-secret',
							}),
						),
					),
				),
			),
		),
	);
});
