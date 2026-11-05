import {
	FileEntry,
	OpenUpload,
	StorageError,
	UploadProgress,
	type SourceId,
	type StoredUpload,
} from '@private-drive/model';
import { normalizeFolder } from '@private-drive/policy';
import { storedUploads, uploadChunkBytes } from '@private-drive/utils';
import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Path from 'effect/Path';

import { AppConfig } from '../config.ts';
import { StateStore } from '../state/store.ts';
import { Drive } from './drive.ts';

const uploadsKey = 'uploads';

const progress = (upload: StoredUpload): UploadProgress =>
	new UploadProgress({
		id: upload.id,
		name: upload.name,
		offset: upload.offset,
		size: upload.size,
	});

// Keeps an interrupted upload so the same file can continue after a refresh.
export class Uploads extends Context.Service<
	Uploads,
	{
		readonly append: (
			id: string,
			start: number,
			bytes: Uint8Array,
		) => Effect.Effect<UploadProgress, StorageError>;
		readonly complete: (id: string) => Effect.Effect<FileEntry, StorageError>;
		readonly list: (
			source: SourceId,
			folder: string,
		) => Effect.Effect<ReadonlyArray<UploadProgress>, StorageError>;
		readonly open: (input: OpenUpload) => Effect.Effect<UploadProgress, StorageError>;
	}
>()('private-drive/Uploads') {
	static readonly layer = Layer.effect(
		Uploads,
		Effect.gen(function* () {
			const config = yield* AppConfig;
			const drive = yield* Drive;
			const path = yield* Path.Path;
			const store = yield* StateStore;
			const directory = path.join(config.dataDir, 'uploads');

			const loadText = Effect.fn('Uploads.loadText')(function* () {
				return yield* store
					.readDoc(uploadsKey)
					.pipe(
						Effect.mapError(() => new StorageError({ message: 'Could not record the upload' })),
					);
			});

			const parse = Effect.fn('Uploads.parse')(function* (text: string | undefined) {
				if (text === undefined) {
					return [] as Array<StoredUpload>;
				}
				return yield* storedUploads(text);
			});

			const save = Effect.fn('Uploads.save')(function* (
				expected: string | undefined,
				uploads: ReadonlyArray<StoredUpload>,
			) {
				return yield* store
					.compareAndSwap(uploadsKey, expected, JSON.stringify(uploads))
					.pipe(
						Effect.mapError(() => new StorageError({ message: 'Could not record the upload' })),
					);
			});

			return Uploads.of({
				// Reuses an upload of the same file, or starts a new temporary file at byte zero.
				open: (input) =>
					Effect.gen(function* () {
						if (input.size < 0) {
							return yield* new StorageError({ message: 'Invalid file size' });
						}
						const folder = yield* normalizeFolder(input.folder).pipe(
							Effect.mapError(() => new StorageError({ message: 'Invalid folder path' })),
						);
						const id = crypto.randomUUID();
						const filePath = path.join(directory, id);
						const upload: StoredUpload = {
							contentType:
								input.contentType === '' ? 'application/octet-stream' : input.contentType,
							folder,
							id,
							name: input.name,
							offset: 0,
							path: filePath,
							size: input.size,
							source: input.source,
						};
						for (let attempt = 0; attempt < 8; attempt++) {
							const text = yield* loadText();
							const current = yield* parse(text);
							const existing = current.find(
								(item) =>
									item.source === input.source &&
									item.folder === folder &&
									item.name === input.name &&
									item.size === input.size,
							);
							if (existing !== undefined) {
								return progress(existing);
							}
							if (attempt === 0) {
								yield* store
									.writeAt(filePath, 0, new Uint8Array())
									.pipe(
										Effect.mapError(
											() => new StorageError({ message: 'Could not start the upload' }),
										),
									);
							}
							const swapped = yield* save(text, [...current, upload]);
							if (swapped === 'ok') {
								return progress(upload);
							}
						}
						return yield* new StorageError({ message: 'Could not record the upload' });
					}),
				list: (source, folder) =>
					Effect.gen(function* () {
						const normalized = yield* normalizeFolder(folder).pipe(
							Effect.mapError(() => new StorageError({ message: 'Invalid folder path' })),
						);
						const current = yield* parse(yield* loadText());
						return current
							.filter((item) => item.source === source && item.folder === normalized)
							.map(progress);
					}),
				// Writes the next slice at the byte the server already has.
				append: (id, start, bytes) =>
					Effect.gen(function* () {
						if (bytes.byteLength > uploadChunkBytes) {
							return yield* new StorageError({ message: 'Upload chunk is too large' });
						}
						for (let attempt = 0; attempt < 8; attempt++) {
							const text = yield* loadText();
							const current = yield* parse(text);
							const upload = current.find((item) => item.id === id);
							if (upload === undefined) {
								return yield* new StorageError({ message: 'Upload not found' });
							}
							if (start !== upload.offset) {
								return yield* new StorageError({
									message: `Resume this upload at byte ${upload.offset}`,
								});
							}
							const next = upload.offset + bytes.byteLength;
							if (next > upload.size) {
								return yield* new StorageError({ message: 'Upload is larger than the file' });
							}
							yield* store
								.writeAt(upload.path, start, bytes)
								.pipe(
									Effect.mapError(
										() => new StorageError({ message: 'Could not write the upload chunk' }),
									),
								);
							const updated = { ...upload, offset: next };
							const swapped = yield* save(
								text,
								current.map((item) => (item.id === id ? updated : item)),
							);
							if (swapped === 'ok') {
								return progress(updated);
							}
						}
						return yield* new StorageError({ message: 'Could not record the upload' });
					}),
				// Stores the finished temporary file with the same rules as a direct upload.
				complete: (id) =>
					Effect.gen(function* () {
						const current = yield* parse(yield* loadText());
						const upload = current.find((item) => item.id === id);
						if (upload === undefined) {
							return yield* new StorageError({ message: 'Upload not found' });
						}
						if (upload.offset !== upload.size) {
							return yield* new StorageError({
								message: `Resume this upload at byte ${upload.offset}`,
							});
						}
						const entry = yield* drive.upload({
							contentType: upload.contentType,
							folder: upload.folder,
							name: upload.name,
							path: upload.path,
							size: upload.size,
							source: upload.source,
						});
						for (let attempt = 0; attempt < 8; attempt++) {
							const text = yield* loadText();
							const rows = yield* parse(text);
							const swapped = yield* save(
								text,
								rows.filter((item) => item.id !== id),
							);
							if (swapped === 'ok') {
								break;
							}
						}
						yield* store.remove(upload.path).pipe(Effect.ignore);
						return entry;
					}),
			});
		}),
	);
}
