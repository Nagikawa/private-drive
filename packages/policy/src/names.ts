import { InvalidFileName } from '@private-drive/model';
import * as Effect from 'effect/Effect';

import { sanitizeFileName } from './paths.ts';

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
