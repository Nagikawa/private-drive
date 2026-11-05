import type { Listing, SourceId } from '@private-drive/domain';

import * as Effect from 'effect/Effect';
import {
	EMPTY,
	combineLatest,
	debounceTime,
	distinctUntilChanged,
	startWith,
	switchMap,
	type Observable,
} from 'rxjs';

import type { DriveServices } from '../../services/drive-runtime/drive-runtime.service';

import { parseFileSort, type FileSort } from './file-sort';

export interface BrowseState {
	listing: Listing | undefined;
	error: string;
	page: number;
	hasPrev: boolean;
	hasNext: boolean;
}

export const emptyBrowse: BrowseState = {
	listing: undefined,
	error: '',
	page: 1,
	hasPrev: false,
	hasNext: false,
};

// Pages one folder. The cursor stack resets when the folder, search, or sort changes.
export const watchFolderListing = (input: {
	readonly bind: <A>(effect: Effect.Effect<A, never, DriveServices>) => Observable<A>;
	readonly folder: Observable<string>;
	readonly load: (query: {
		source: SourceId;
		folder: string;
		search: string;
		kind: 'all';
		recursive: 'false';
		sort: 'name' | 'size' | 'created' | 'type';
		order: 'asc' | 'desc';
		cursor?: string;
	}) => Effect.Effect<Listing, { readonly message: string }, DriveServices>;
	readonly onLoaded: () => void;
	readonly refresh: Observable<void>;
	readonly search: Observable<string>;
	readonly sort: Observable<FileSort>;
	readonly source: Observable<SourceId>;
	readonly turnPage: Observable<'next' | 'prev'>;
}): Observable<BrowseState> =>
	combineLatest([
		input.source,
		input.folder,
		input.search.pipe(debounceTime(250), distinctUntilChanged()),
		input.sort,
		input.refresh.pipe(startWith(undefined)),
	]).pipe(
		switchMap(([source, folder, search, sort]) => {
			const parsed = parseFileSort(sort);
			const history: Array<string | undefined> = [undefined];
			let index = 0;
			return input.turnPage.pipe(
				startWith(undefined),
				switchMap((turn) => {
					if (turn === 'next') {
						if (history[index + 1] === undefined) {
							return EMPTY;
						}
						index += 1;
					} else if (turn === 'prev') {
						if (index === 0) {
							return EMPTY;
						}
						index -= 1;
					} else {
						index = 0;
					}
					const cursor = history[index];
					return input.bind(
						input
							.load({
								source,
								folder,
								search,
								kind: 'all',
								recursive: 'false',
								sort: parsed.sort,
								order: parsed.order,
								...(cursor === undefined ? {} : { cursor }),
							})
							.pipe(
								Effect.tap((listing) =>
									Effect.sync(() => {
										input.onLoaded();
										if (listing.next !== undefined) {
											history[index + 1] = listing.next;
										}
									}),
								),
								Effect.map((listing): BrowseState => ({
									listing,
									error: '',
									page: index + 1,
									hasPrev: index > 0,
									hasNext: listing.next !== undefined,
								})),
								Effect.catch((error) =>
									Effect.succeed<BrowseState>({
										listing: undefined,
										error: error.message,
										page: index + 1,
										hasPrev: false,
										hasNext: false,
									}),
								),
							),
					);
				}),
			);
		}),
	);
