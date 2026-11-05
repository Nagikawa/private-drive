import * as Vitest from '@effect/vitest';
import * as Effect from 'effect/Effect';
import * as Option from 'effect/Option';
import * as Redacted from 'effect/Redacted';

import {
	directoryOf,
	huggingfaceSettings,
	presentText,
	r2Settings,
	telegramSettings,
} from '../src/config.ts';

Vitest.describe('config assembly', () => {
	// A blank env value is the same as leaving the variable unset.
	Vitest.it.effect('drops blank text and keeps a trimmed value', () =>
		Effect.gen(function* () {
			Vitest.expect(yield* presentText(Option.none())).toBeUndefined();
			Vitest.expect(yield* presentText(Option.some('  '))).toBeUndefined();
			Vitest.expect(yield* presentText(Option.some(' bucket '))).toBe('bucket');
		}),
	);

	// An old index file still names the directory that holds sessions and uploads.
	Vitest.it.effect('reads the directory of a path', () =>
		Effect.gen(function* () {
			Vitest.expect(yield* directoryOf('data/index.json')).toBe('data');
			Vitest.expect(yield* directoryOf('index.json')).toBe('.');
		}),
	);

	// A provider is configured only when every required field is present.
	Vitest.it.effect('requires a complete provider', () =>
		Effect.gen(function* () {
			const secret = Redacted.make('secret');
			Vitest.expect(yield* r2Settings('account', 'key', undefined, secret)).toBeUndefined();
			Vitest.expect(yield* r2Settings('account', 'key', 'bucket', secret)).toEqual({
				accessKeyId: 'key',
				accountId: 'account',
				bucket: 'bucket',
				secretAccessKey: secret,
			});
			Vitest.expect(yield* telegramSettings(undefined, secret)).toBeUndefined();
			Vitest.expect(yield* huggingfaceSettings('repo', secret)).toEqual({
				repo: 'repo',
				token: secret,
			});
		}),
	);
});
