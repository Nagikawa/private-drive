import * as Vitest from '@effect/vitest';
import * as Effect from 'effect/Effect';

import { NetworkFailure, PreferenceFailure } from './drive-error';

Vitest.describe('drive errors', () => {
	// Screens match these tags when a request or a saved preference fails.
	Vitest.it.effect('tags a network failure and a preference failure', () =>
		Effect.sync(() => {
			Vitest.expect(new NetworkFailure({ message: 'Could not connect' })._tag).toBe(
				'NetworkFailure',
			);
			Vitest.expect(new PreferenceFailure({ message: 'Could not save preferences' }).message).toBe(
				'Could not save preferences',
			);
		}),
	);
});
