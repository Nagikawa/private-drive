import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import type { ListOrder, ListSort } from './list-page.ts';

export const FileSort = Schema.Literals([
	'name-asc',
	'name-desc',
	'size-asc',
	'size-desc',
	'created-asc',
	'created-desc',
	'type-asc',
	'type-desc',
]);
export type FileSort = typeof FileSort.Type;

export const fileSorts: ReadonlyArray<FileSort> = [
	'name-asc',
	'name-desc',
	'size-asc',
	'size-desc',
	'created-asc',
	'created-desc',
	'type-asc',
	'type-desc',
];

// The select value is one token. The API wants the field and the direction separately.
export const parseFileSort = Effect.fnUntraced(function* (value: FileSort) {
	const [sort, order] = value.split('-');
	if (
		(sort === 'name' || sort === 'size' || sort === 'created' || sort === 'type') &&
		(order === 'asc' || order === 'desc')
	) {
		return { order, sort } as { readonly order: ListOrder; readonly sort: ListSort };
	}
	return { order: 'asc' as const, sort: 'name' as const };
});

export const isFileSort = Schema.is(FileSort);
