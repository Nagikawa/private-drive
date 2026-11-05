import * as Vitest from '@effect/vitest';
import { FileEntry, UploadProgress } from '@private-drive/domain';
import * as Effect from 'effect/Effect';

import { NetworkFailure } from '../../core/drive-error';
import { ApiClient } from '../../services/drive-runtime/drive-runtime.service';
import { uploadChunked, type ResumableUpload } from './upload-chunks';

const file = new File([new Uint8Array([1, 2, 3])], 'a.txt', { type: 'text/plain' });

const entry = new FileEntry({
	contentType: 'text/plain',
	createdAt: '2026-01-01T00:00:00.000Z',
	folder: '',
	id: 'stored',
	image: false,
	name: 'a.txt',
	size: 3,
	source: 'r2',
});

Vitest.describe('uploadChunked', () => {
	// The mock API never calls the client. The upload effect still lists those services.
	Vitest.it.layer(ApiClient.layer)((it) => {
		// One small file is one slice, then the session is completed.
		it.effect('sends each slice and counts a finished file', () =>
			Effect.gen(function* () {
				const notices: Array<string> = [];
				const ranges: Array<string> = [];
				const api: ResumableUpload = {
					completeUpload: () => Effect.succeed(entry),
					openUpload: () =>
						Effect.succeed(new UploadProgress({ id: 'up-1', name: 'a.txt', offset: 0, size: 3 })),
					sendChunk: (_id, start, end) =>
						Effect.sync(() => {
							ranges.push(`${start}-${end}`);
							return end + 1;
						}),
				};
				const failed = yield* uploadChunked({
					api,
					files: [file],
					folder: 'img',
					onNotice: (message) => notices.push(message),
					onStatus: () => undefined,
					source: 'r2',
				});
				Vitest.expect(failed).toBe(0);
				Vitest.expect(ranges).toEqual(['0-2']);
				Vitest.expect(notices).toEqual([]);
			}),
		);

		// A chunk that does not advance is a failure, and the queue still finishes the count.
		it.effect('counts a chunk that does not advance', () =>
			Effect.gen(function* () {
				const notices: Array<string> = [];
				const api: ResumableUpload = {
					completeUpload: () => Effect.succeed(entry),
					openUpload: () =>
						Effect.succeed(new UploadProgress({ id: 'up-1', name: 'a.txt', offset: 0, size: 3 })),
					sendChunk: () => Effect.succeed(0),
				};
				const failed = yield* uploadChunked({
					api,
					files: [file],
					folder: '',
					onNotice: (message) => notices.push(message),
					onStatus: () => undefined,
					source: 'r2',
				});
				Vitest.expect(failed).toBe(1);
				Vitest.expect(notices[0]).toBe(
					new NetworkFailure({ message: 'Could not upload the next part' }).message,
				);
				Vitest.expect(notices).not.toContain('Upload complete');
			}),
		);
	});
});
