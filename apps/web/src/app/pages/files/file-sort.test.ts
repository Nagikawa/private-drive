import { describe, expect, it } from '@effect/vitest';
import { Effect } from 'effect';
import { isFileSort, parseFileSort } from './file-sort';

describe('file sort', () => {
  // The select value is one token. The list request wants the field and the direction apart.
  it.effect('splits a known sort and rejects anything else', () =>
    Effect.sync(() => {
      expect(parseFileSort('created-desc')).toEqual({ sort: 'created', order: 'desc' });
      expect(parseFileSort('type-asc')).toEqual({ sort: 'type', order: 'asc' });
      expect(isFileSort('size-desc')).toBe(true);
      expect(isFileSort('recent')).toBe(false);
    }));
});
