import { Service, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { PreferenceFailure, type SourceId } from '@private-drive/model';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';

const sourceKey = 'private-drive.source';
const themeKey = 'private-drive.theme';

// Reads one saved preference and fails with a tagged error when storage is unavailable.
const readStored = Effect.fnUntraced(function* (key: string) {
	return yield* Effect.try({
		try: () => localStorage.getItem(key),
		catch: () => new PreferenceFailure({ message: 'Could not read saved preferences' }),
	});
});

// Restores the last storage source, falling back to R2 when the saved value is missing or stale.
const readSource = Effect.fnUntraced(function* () {
	const stored = yield* readStored(sourceKey);
	if (stored === 'telegram' || stored === 'huggingface' || stored === 'r2') {
		return stored;
	}
	return 'r2' as const;
});

// Writes the theme and source, and reports a tagged error instead of throwing from storage.
const writePreferences = Effect.fnUntraced(function* (theme: string, source: SourceId) {
	yield* Effect.sync(() => {
		document.documentElement.dataset['theme'] = theme;
	});
	yield* Effect.try({
		try: () => {
			localStorage.setItem(themeKey, theme);
			localStorage.setItem(sourceKey, source);
		},
		catch: () => new PreferenceFailure({ message: 'Could not save preferences' }),
	});
});

// Reads a preference at startup and keeps the fallback when storage fails.
const stored = <A>(task: Effect.Effect<A, PreferenceFailure>, fallback: A): A => {
	const exit = Effect.runSyncExit(task);
	return Exit.isSuccess(exit) ? exit.value : fallback;
};

@Service()
export class Workspace {
	private readonly router = inject(Router);
	readonly source = signal<SourceId>(stored(readSource(), 'r2'));
	readonly dark = signal(
		stored(readStored(themeKey).pipe(Effect.map((value) => value === 'dark')), false),
	);

	// Writes the theme and source whenever those signals change, including the first read.
	private readonly persist = effect(() => {
		const theme = this.dark() ? 'dark' : 'light';
		const source = this.source();
		Effect.runSyncExit(writePreferences(theme, source));
	});

	// Switches the active source and returns to Root so the previous folder path is not reused.
	setSource(source: SourceId): void {
		this.source.set(source);
		const router = this.router;
		void Effect.runPromiseExit(
			Effect.tryPromise({
				try: () =>
					router.navigate([], {
						queryParams: { folder: null },
						queryParamsHandling: 'merge',
					}),
				catch: () => new PreferenceFailure({ message: 'Could not open Root' }),
			}).pipe(Effect.catch(() => Effect.void)),
		);
	}

	// Flips the document theme and lets the persist effect store the choice.
	toggleTheme(): void {
		this.dark.update((value) => !value);
	}
}
