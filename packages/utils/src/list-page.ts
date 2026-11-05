import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

export const listSorts = ['name', 'size', 'created', 'type'] as const;
export type ListSort = (typeof listSorts)[number];

export const listOrders = ['asc', 'desc'] as const;
export type ListOrder = (typeof listOrders)[number];

// One screen of the file pane. The cursor asks for the rows after this page.
export const listPageSize = 100;

export interface ListRow {
	readonly contentType?: string;
	readonly createdAt: string;
	readonly id: string;
	readonly name: string;
	readonly size: number;
}

export interface ListPage<A> {
	readonly files: ReadonlyArray<A>;
	readonly next?: string;
}

// A page cursor was not the base64url form of a file id.
class InvalidCursor extends Schema.TaggedError<InvalidCursor>()('InvalidCursor', {
	message: Schema.String,
}) {}

const encodeCursor = Effect.fnUntraced(function* (id: string) {
	const bytes = new TextEncoder().encode(id);
	let binary = '';
	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}
	return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
});

const decodeCursor = Effect.fnUntraced(function* (cursor: string) {
	const id = yield* Effect.try({
		try: () => {
			const padded = cursor.replaceAll('-', '+').replaceAll('_', '/');
			const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
			const binary = atob(`${padded}${pad}`);
			const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
			return new TextDecoder().decode(bytes);
		},
		catch: () => new InvalidCursor({ message: 'Invalid page cursor' }),
	}).pipe(Effect.catch(() => Effect.succeed(undefined)));
	if (id === undefined || id === '') {
		return undefined;
	}
	return id;
});

const compareRows =
	(sort: ListSort, order: ListOrder) =>
	(left: ListRow, right: ListRow): number => {
		const primary =
			sort === 'size'
				? left.size - right.size
				: sort === 'created'
					? left.createdAt.localeCompare(right.createdAt)
					: sort === 'type'
						? (left.contentType ?? '').localeCompare(right.contentType ?? '')
						: left.name.localeCompare(right.name, 'zh-Hant');
		const tied = primary === 0 ? left.id.localeCompare(right.id) : primary;
		return order === 'desc' ? -tied : tied;
	};

// Sorts the folder, then returns the page that follows the cursor.
export const pageFiles = Effect.fnUntraced(function* <A extends ListRow>(
	files: ReadonlyArray<A>,
	input: {
		readonly cursor?: string;
		readonly limit?: number;
		readonly order: ListOrder;
		readonly sort: ListSort;
	},
) {
	const limit = input.limit ?? listPageSize;
	if (limit <= 0) {
		return { files: [] as ReadonlyArray<A> };
	}
	const sorted = [...files].sort(compareRows(input.sort, input.order));
	const previousId = input.cursor === undefined ? undefined : yield* decodeCursor(input.cursor);
	const previous =
		previousId === undefined ? -1 : sorted.findIndex((file) => file.id === previousId);
	const start = previous + 1;
	const page = sorted.slice(start, start + limit);
	const last = page.at(-1);
	const next =
		last !== undefined && start + page.length < sorted.length
			? yield* encodeCursor(last.id)
			: undefined;
	return next === undefined ? { files: page } : { files: page, next };
});
