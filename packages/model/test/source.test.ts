import * as Vitest from '@effect/vitest';
import * as Effect from 'effect/Effect';

import { keepName, labels, limits } from '../src/source.ts';

Vitest.describe('source data', () => {
	// The UI and the errors use the same names for the three sources.
	Vitest.it.effect('names each source', () =>
		Effect.sync(() => {
			Vitest.expect(labels.r2).toBe('Cloudflare R2');
			Vitest.expect(labels.telegram).toBe('Telegram');
			Vitest.expect(labels.huggingface).toBe('Hugging Face');
			Vitest.expect(keepName).toBe('.keep');
			Vitest.expect(limits.telegram).toBe(50 * 1024 * 1024);
		}),
	);
});
