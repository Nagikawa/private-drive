import { describe, expect, it } from '@effect/vitest';
import { Effect } from 'effect';
import { NetworkFailure, PreferenceFailure } from './drive-error';

describe('drive errors', () => {
  // Screens match these tags when a request or a saved preference fails.
  it.effect('tags a network failure and a preference failure', () =>
    Effect.sync(() => {
      expect(new NetworkFailure({ message: 'Could not connect' })._tag).toBe('NetworkFailure');
      expect(new PreferenceFailure({ message: 'Could not save preferences' }).message).toBe(
        'Could not save preferences',
      );
    }));
});
