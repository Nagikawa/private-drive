import * as Vitest from '@effect/vitest';
import * as Effect from 'effect/Effect';

import { pageFiles, type ListRow } from '../src/utils/list-page.ts';

const rows: ReadonlyArray<ListRow> = [
	{
		contentType: 'image/jpeg',
		createdAt: '2026-01-02T00:00:00.000Z',
		id: 'b',
		name: 'beta',
		size: 10,
	},
	{
		contentType: 'text/plain',
		createdAt: '2026-01-03T00:00:00.000Z',
		id: 'c',
		name: 'alpha',
		size: 30,
	},
	{
		contentType: 'video/mp4',
		createdAt: '2026-01-01T00:00:00.000Z',
		id: 'a',
		name: 'gamma',
		size: 20,
	},
];

Vitest.describe('pageFiles', () => {
	// The file pane defaults to A-to-Z, with the id breaking a tie.
	Vitest.it.effect('sorts names ascending and returns the next cursor', () =>
		Effect.gen(function* () {
			const page = pageFiles(rows, { limit: 2, order: 'asc', sort: 'name' });
			Vitest.expect(page.files.map((file) => file.name)).toEqual(['alpha', 'beta']);
			Vitest.expect(page.next).toBeDefined();
			const rest = pageFiles(rows, { cursor: page.next, limit: 2, order: 'asc', sort: 'name' });
			Vitest.expect(rest.files.map((file) => file.id)).toEqual(['a']);
			Vitest.expect(rest.next).toBeUndefined();
		}),
	);

	// Newest and largest are the two sorts the pane offers besides the name.
	Vitest.it.effect('sorts size and created time descending', () =>
		Effect.gen(function* () {
			Vitest.expect(
				pageFiles(rows, { order: 'desc', sort: 'size' }).files.map((file) => file.size),
			).toEqual([30, 20, 10]);
			Vitest.expect(
				pageFiles(rows, { order: 'desc', sort: 'created' }).files.map((file) => file.id),
			).toEqual(['c', 'b', 'a']);
			Vitest.expect(
				pageFiles(rows, { order: 'asc', sort: 'type' }).files.map((file) => file.id),
			).toEqual(['b', 'c', 'a']);
		}),
	);

	// A cursor for a file that is no longer in the folder starts again at the first row.
	Vitest.it.effect('starts at the first row when the cursor file is gone', () =>
		Effect.gen(function* () {
			const removed = pageFiles(
				[
					{ createdAt: '2026-01-01T00:00:00.000Z', id: 'missing', name: 'aaa', size: 1 },
					{ createdAt: '2026-01-01T00:00:00.000Z', id: 'tail', name: 'zzz', size: 1 },
				],
				{
					limit: 1,
					order: 'asc',
					sort: 'name',
				},
			).next;
			Vitest.expect(removed).toBeDefined();
			const page = pageFiles(rows, { cursor: removed, order: 'asc', sort: 'name' });
			Vitest.expect(page.files.map((file) => file.name)).toEqual(['alpha', 'beta', 'gamma']);
		}),
	);
});
