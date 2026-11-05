import * as Vitest from '@effect/vitest';
import * as Effect from 'effect/Effect';

import { connectedResource } from '../src/resource.ts';

Vitest.describe('connectedResource', () => {
	// The bucket name is the text after the connected prefix.
	Vitest.it.effect('returns an R2 bucket name', () =>
		Effect.gen(function* () {
			Vitest.expect(yield* connectedResource('Connected nagikawa-cloud')).toBe('nagikawa-cloud');
		}),
	);

	// A dataset id can contain a slash and is still one resource name.
	Vitest.it.effect('returns a Hugging Face repo', () =>
		Effect.gen(function* () {
			Vitest.expect(yield* connectedResource('Connected avalanch3/nagiwaka-cloud')).toBe(
				'avalanch3/nagiwaka-cloud',
			);
		}),
	);

	// A status without that prefix is a tagged error, not a thrown exception.
	Vitest.it.effect('fails when the status has no resource name', () =>
		Effect.gen(function* () {
			const error = yield* connectedResource('Not configured').pipe(Effect.flip);
			Vitest.expect(error._tag).toBe('ResourceNameError');
			Vitest.expect(error.message).toBe('Status has no resource name');
		}),
	);

	// An empty name after the prefix is the same tagged failure.
	Vitest.it.effect('fails when the resource name is blank', () =>
		Effect.gen(function* () {
			const error = yield* connectedResource('Connected ').pipe(Effect.flip);
			Vitest.expect(error._tag).toBe('ResourceNameError');
		}),
	);
});
