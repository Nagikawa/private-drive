import * as Vitest from '@effect/vitest';
import { Listing } from '@private-drive/domain';
import * as Effect from 'effect/Effect';
import { Observable, of, Subject } from 'rxjs';

import type { DriveServices } from '../../services/drive-runtime/drive-runtime.service';

import { emptyBrowse, watchFolderListing, type BrowseState } from './folder-browse';

const page = (next?: string) =>
	new Listing({
		files: [],
		folder: '',
		folders: [],
		source: 'r2',
		truncated: false,
		...(next === undefined ? {} : { next }),
	});

const collect = (turn: Subject<'next' | 'prev'>) => {
	const states: Array<BrowseState> = [];
	let loaded = 0;
	const refresh = new Subject<void>();
	const subscription = watchFolderListing({
		bind: <A>(effect: Effect.Effect<A, never, DriveServices>) =>
			new Observable<A>((subscriber) => {
				void Effect.runPromise(effect as unknown as Effect.Effect<A, never, never>).then(
					(value) => {
						subscriber.next(value);
						subscriber.complete();
					},
				);
			}),
		folder: of(''),
		load: (query) => Effect.succeed(query.cursor === undefined ? page('cursor-2') : page()),
		onLoaded: () => {
			loaded += 1;
		},
		refresh,
		search: of(''),
		sort: of('name-asc'),
		source: of('r2'),
		turnPage: turn,
	}).subscribe((state) => states.push(state));
	return { loaded: () => loaded, states, subscription };
};

Vitest.describe('watchFolderListing', () => {
	// The next cursor is kept, and the following page can go back.
	Vitest.it.live('turns to the next page after the search debounce', () =>
		Effect.gen(function* () {
			const turn = new Subject<'next' | 'prev'>();
			const watched = collect(turn);
			yield* Effect.sleep('300 millis');
			Vitest.expect(watched.states.at(-1)?.page).toBe(1);
			Vitest.expect(watched.states.at(-1)?.hasNext).toBe(true);
			Vitest.expect(watched.loaded()).toBe(1);
			turn.next('next');
			yield* Effect.sleep('50 millis');
			Vitest.expect(watched.states.at(-1)?.page).toBe(2);
			Vitest.expect(watched.states.at(-1)?.hasPrev).toBe(true);
			Vitest.expect(emptyBrowse.page).toBe(1);
			watched.subscription.unsubscribe();
		}),
	);
});
