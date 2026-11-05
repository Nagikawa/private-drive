import * as Vitest from '@effect/vitest';
import * as Effect from 'effect/Effect';

import {
	InvalidFileName,
	InvalidFolderPath,
	NetworkFailure,
	PreferenceFailure,
	ResourceNameError,
} from '../src/errors.ts';

Vitest.describe('errors', () => {
	// Callers match these tags instead of reading thrown exceptions.
	Vitest.it.effect('tags the expected failures', () =>
		Effect.sync(() => {
			Vitest.expect(new InvalidFolderPath({ message: 'bad' })._tag).toBe('InvalidFolderPath');
			Vitest.expect(new InvalidFileName({ message: 'bad' })._tag).toBe('InvalidFileName');
			Vitest.expect(new ResourceNameError({ message: 'bad' })._tag).toBe('ResourceNameError');
			Vitest.expect(new NetworkFailure({ message: 'Could not connect' })._tag).toBe(
				'NetworkFailure',
			);
			Vitest.expect(new PreferenceFailure({ message: 'Could not save preferences' }).message).toBe(
				'Could not save preferences',
			);
		}),
	);
});
