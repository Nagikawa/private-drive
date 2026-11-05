import * as Vitest from '@effect/vitest';
import * as Effect from 'effect/Effect';

import { bytesOf, keepName, labels, unavailable } from '../src/storage/shared.ts';

Vitest.describe('storage labels', () => {
	// The UI and the errors use the same names for the three sources.
	Vitest.it.effect('names each source and explains a missing configuration', () =>
		Effect.sync(() => {
			Vitest.expect(labels.r2).toBe('Cloudflare R2');
			Vitest.expect(labels.telegram).toBe('Telegram');
			Vitest.expect(labels.huggingface).toBe('Hugging Face');
			Vitest.expect(keepName).toBe('.keep');
			Vitest.expect(unavailable('telegram').message).toContain('Telegram');
			Vitest.expect(bytesOf(new Uint8Array(4))).toBe(4);
		}),
	);
});
