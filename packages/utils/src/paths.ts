import * as Effect from 'effect/Effect';

// Returns the parent path, using an empty string for a top-level folder so Root stays addressable.
export const parentFolder = Effect.fnUntraced(function* (folder: string) {
	const index = folder.lastIndexOf('/');
	return index === -1 ? '' : folder.slice(0, index);
});

// Returns the last segment for labels in the tree and breadcrumbs.
export const folderName = Effect.fnUntraced(function* (folder: string) {
	const index = folder.lastIndexOf('/');
	return index === -1 ? folder : folder.slice(index + 1);
});

// Joins a folder and a child without a leading slash, so Root stays an empty path.
export const joinFolder = Effect.fnUntraced(function* (folder: string, name: string) {
	return folder === '' ? name : `${folder}/${name}`;
});

// Builds the object key from the same folder rules the index uses for display paths.
export const storageKey = Effect.fnUntraced(function* (folder: string, name: string) {
	return yield* joinFolder(folder, name);
});

// Splits an object key into the folder the UI shows and the file name.
export const splitStorageKey = Effect.fnUntraced(function* (key: string) {
	const index = key.lastIndexOf('/');
	if (index === -1) {
		return { folder: '', name: key };
	}
	return { folder: key.slice(0, index), name: key.slice(index + 1) };
});

// True when path is one level under parent, which is what a non-recursive listing should show.
export const isDirectChildFolder = Effect.fnUntraced(function* (parent: string, path: string) {
	return (yield* parentFolder(path)) === parent;
});

// True when path is the folder itself or nested inside it, so recursive listings stay in scope.
export const isWithinFolder = Effect.fnUntraced(function* (parent: string, path: string) {
	return parent === '' || path === parent || path.startsWith(`${parent}/`);
});
