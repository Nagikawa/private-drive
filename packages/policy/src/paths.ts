import { InvalidFileName, InvalidFolderPath, keepName } from '@private-drive/model';
import * as Effect from 'effect/Effect';

// Collapses slashes and rejects `.` or `..` so a folder path cannot leave the drive root.
export const normalizeFolder = Effect.fnUntraced(function* (input: string) {
	const cleaned = input
		.trim()
		.replaceAll('\\', '/')
		.replace(/^\/+|\/+$/g, '');
	if (cleaned === '') {
		return '';
	}
	const parts = cleaned.split('/');
	if (parts.some((part) => part === '' || part === '.' || part === '..')) {
		return yield* new InvalidFolderPath({ message: 'Invalid folder path' });
	}
	return parts.join('/');
});

// Keeps only the final path segment and drops names that would hide a folder marker or escape a directory.
export const sanitizeFileName = Effect.fnUntraced(function* (input: string) {
	const base = input.split(/[/\\]/).at(-1)?.replaceAll('\u0000', '').trim() ?? '';
	if (base === '' || base === '.' || base === '..' || base === keepName) {
		return yield* new InvalidFileName({ message: 'Invalid file name' });
	}
	return base;
});
