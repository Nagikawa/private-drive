import { env } from 'cloudflare:workers';
import * as ConfigProvider from 'effect/ConfigProvider';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';

const names = [
	'AUTH_PASSWORD',
	'SESSION_SECRET',
	'DATA_DIR',
	'PORT',
	'R2_ACCOUNT_ID',
	'R2_ACCESS_KEY_ID',
	'R2_SECRET_ACCESS_KEY',
	'R2_BUCKET',
	'TG_BOT_TOKEN',
	'TG_CHAT_ID',
	'HF_TOKEN',
	'HF_REPO',
] as const;

// Reads Worker vars when the handler layer is built. The cookie is always secure on HTTPS.
export const WorkerConfig = Layer.unwrap(
	Effect.sync(() => {
		const record: Record<string, string> = {
			COOKIE_SECURE: 'true',
			DATA_DIR: 'state',
		};
		for (const name of names) {
			const value = env[name];
			if (typeof value === 'string' && value !== '') {
				record[name] = value;
			}
		}
		record['COOKIE_SECURE'] = 'true';
		return ConfigProvider.layer(ConfigProvider.fromEnvRecord(record));
	}),
);
