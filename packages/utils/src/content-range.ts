import { ContentRangeError } from '@private-drive/model';
import * as Effect from 'effect/Effect';

const rangePattern = /^bytes (\d+)-(\d+)\/(\d+)$/;

// Reads the byte window a resumable upload claims to send.
export const contentRange = Effect.fnUntraced(function* (header: string) {
	const match = rangePattern.exec(header);
	if (match === null) {
		return yield* new ContentRangeError({ message: 'Content-Range is required' });
	}
	return {
		end: Number(match[2]),
		start: Number(match[1]),
		total: Number(match[3]),
	};
});
