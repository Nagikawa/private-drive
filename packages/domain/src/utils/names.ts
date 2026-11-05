import * as Effect from 'effect/Effect';

import { InvalidFileName } from '../errors.ts';
import { sanitizeFileName } from '../policy/paths.ts';

// Keeps the stored extension, so a typed suffix cannot change the file type.
export const nameKeepingType = Effect.fnUntraced(function* (
	currentName: string,
	requested: string,
) {
	const dot = currentName.lastIndexOf('.');
	const extension = dot > 0 ? currentName.slice(dot) : '';
	const cleaned = yield* sanitizeFileName(requested);
	const requestedDot = cleaned.lastIndexOf('.');
	const stem = requestedDot > 0 ? cleaned.slice(0, requestedDot) : cleaned;
	if (stem === '' || stem === '.' || stem === '..') {
		return yield* new InvalidFileName({ message: 'Invalid file name' });
	}
	return `${stem}${extension}`;
});

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
