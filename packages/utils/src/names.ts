import { keepName, type RemoteListing } from '@private-drive/model';
import * as Effect from 'effect/Effect';

import { splitStorageKey } from './paths.ts';

// Adds a numeric suffix so two uploads in the same folder can share a display name.
export const uniqueName = Effect.fnUntraced(function* (name: string, used: ReadonlySet<string>) {
	if (!used.has(name)) {
		return name;
	}
	const dot = name.lastIndexOf('.');
	const stem = dot > 0 ? name.slice(0, dot) : name;
	const extension = dot > 0 ? name.slice(dot) : '';
	let index = 2;
	while (used.has(`${stem}-${index}${extension}`)) {
		index += 1;
	}
	return `${stem}-${index}${extension}`;
});

// Display names already stored in this folder, ignoring the empty-folder marker.
export const namesInFolder = Effect.fnUntraced(function* (remote: RemoteListing, folder: string) {
	const names = new Set<string>();
	for (const file of remote.files) {
		const parts = yield* splitStorageKey(file.key);
		if (parts.folder === folder && parts.name !== keepName) {
			names.add(parts.name);
		}
	}
	return names;
});
