import * as Vitest from '@effect/vitest';
import * as Effect from 'effect/Effect';

import { contentSignatureValid, shareLifetime, signContent } from '../src/auth/share.ts';

Vitest.describe('content signatures', () => {
	// A link for this file stays valid until its expiry.
	Vitest.it.effect('accepts a signature for the same file before it expires', () =>
		Effect.sync(() => {
			const expiresAt = 5_000;
			const signature = signContent('secret', 'file-1', expiresAt);
			Vitest.expect(shareLifetime).toBe(60 * 60 * 1000);
			Vitest.expect(
				contentSignatureValid('secret', 'file-1', String(expiresAt), signature, 4_000),
			).toBe(true);
		}),
	);

	// Another file, a wrong secret, or a past expiry must not open the content route.
	Vitest.it.effect('rejects a signature that does not match this file and time', () =>
		Effect.sync(() => {
			const signature = signContent('secret', 'file-1', 5_000);
			Vitest.expect(contentSignatureValid('secret', 'file-2', '5000', signature, 4_000)).toBe(
				false,
			);
			Vitest.expect(contentSignatureValid('other', 'file-1', '5000', signature, 4_000)).toBe(false);
			Vitest.expect(contentSignatureValid('secret', 'file-1', '5000', signature, 5_000)).toBe(
				false,
			);
			Vitest.expect(contentSignatureValid('secret', 'file-1', 'nope', signature, 0)).toBe(false);
			Vitest.expect(contentSignatureValid('secret', 'file-1', '5000', '', 0)).toBe(false);
		}),
	);
});
