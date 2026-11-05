import {
	AbortMultipartUploadCommand,
	CompleteMultipartUploadCommand,
	CopyObjectCommand,
	CreateMultipartUploadCommand,
	DeleteObjectCommand,
	GetObjectCommand,
	HeadBucketCommand,
	ListObjectsV2Command,
	PutObjectCommand,
	UploadPartCommand,
	S3Client,
} from '@aws-sdk/client-s3';
import { StorageError, type RemoteFile, type RemoteListing } from '@private-drive/model';
import {
	contentTypeFromName,
	parentFolder,
	splitStorageKey,
	pendingUploads,
	unavailable,
	uploadPartBytes,
	uploadParts,
} from '@private-drive/utils';
import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as FileSystem from 'effect/FileSystem';
import * as Layer from 'effect/Layer';
import * as Predicate from 'effect/Predicate';
import * as Redacted from 'effect/Redacted';
import * as Result from 'effect/Result';
import * as Stream from 'effect/Stream';

import { AppConfig } from '../config.ts';
import { StateStore } from '../state/store.ts';

// The browser AWS client sometimes returns the object body as a ReadableStream without transformToWebStream.
export const objectWebStream = (body: unknown): ReadableStream<Uint8Array> | undefined => {
	if (
		Predicate.isObject(body) &&
		Predicate.hasProperty(body, 'transformToWebStream') &&
		typeof body.transformToWebStream === 'function'
	) {
		const stream: unknown = body.transformToWebStream();
		if (stream instanceof ReadableStream) {
			return stream;
		}
	}
	if (body instanceof ReadableStream) {
		return body;
	}
	return undefined;
};

export class R2 extends Context.Service<
	R2,
	{
		readonly configured: boolean;
		copy(from: string, to: string): Effect.Effect<void, StorageError>;
		delete(key: string): Effect.Effect<void, StorageError>;
		get(key: string): Effect.Effect<Uint8Array, StorageError>;
		list(folder: string, recursive: boolean): Effect.Effect<RemoteListing, StorageError>;
		open(key: string): Effect.Effect<Stream.Stream<Uint8Array, StorageError>, StorageError>;
		put(key: string, bytes: Uint8Array, contentType: string): Effect.Effect<void, StorageError>;
		putFile(
			key: string,
			path: string,
			size: number,
			contentType: string,
		): Effect.Effect<void, StorageError>;
		status(): Effect.Effect<string, StorageError>;
	}
>()('private-drive/api/storage/R2') {
	// Builds one S3 client when R2 credentials exist, and fails the methods when they do not.
	static readonly layer = Layer.effect(
		R2,
		Effect.gen(function* () {
			const config = yield* AppConfig;
			const fs = yield* FileSystem.FileSystem;
			const store = yield* StateStore;
			const client =
				config.r2 === undefined
					? undefined
					: new S3Client({
							credentials: {
								accessKeyId: config.r2.accessKeyId,
								secretAccessKey: Redacted.value(config.r2.secretAccessKey),
							},
							endpoint: `https://${config.r2.accountId}.r2.cloudflarestorage.com`,
							forcePathStyle: true,
							region: 'auto',
							// The default checksum mode replaces the body with a stream that drops transformToWebStream.
							requestChecksumCalculation: 'WHEN_REQUIRED',
							responseChecksumValidation: 'WHEN_REQUIRED',
						});

			// Sends one S3 command and maps SDK rejections onto the storage error the API returns.
			const send = <A>(command: object) =>
				Effect.gen(function* () {
					if (client === undefined) {
						return yield* new StorageError({ message: 'R2 is not configured' });
					}
					return yield* Effect.tryPromise({
						catch: (cause) =>
							new StorageError({
								message:
									Predicate.isObject(cause) &&
									Predicate.hasProperty(cause, 'message') &&
									Predicate.isString(cause.message)
										? cause.message
										: 'R2 request failed',
							}),
						try: () => client.send(command as never) as Promise<A>,
					});
				});

			// Pages the bucket so a folder listing can include nested keys without loading the whole account at once.
			const list = Effect.fn('R2.list')(function* (folder: string, recursive: boolean) {
				if (config.r2 === undefined) {
					return yield* unavailable('r2');
				}
				const prefix = folder === '' ? '' : `${folder}/`;
				const files: Array<RemoteFile> = [];
				const folderSet = new Set<string>();
				// Records a key's folder and its parents so the tree still shows intermediate directories.
				const remember = Effect.fnUntraced(function* (path: string) {
					let current = path;
					while (current !== '') {
						if (folderSet.has(current)) {
							return;
						}
						folderSet.add(current);
						current = yield* parentFolder(current);
					}
				});
				let token: string | undefined;
				let truncated = false;
				do {
					const page = yield* send<{
						readonly CommonPrefixes?: ReadonlyArray<{ readonly Prefix?: string }>;
						readonly Contents?: ReadonlyArray<{
							readonly Key?: string;
							readonly LastModified?: Date;
							readonly Size?: number;
						}>;
						readonly IsTruncated?: boolean;
						readonly NextContinuationToken?: string;
					}>(
						new ListObjectsV2Command({
							Bucket: config.r2.bucket,
							ContinuationToken: token,
							Delimiter: recursive ? undefined : '/',
							MaxKeys: 1000,
							Prefix: prefix,
						}),
					);
					for (const item of page.Contents ?? []) {
						if (item.Key === undefined || item.Key.endsWith('/')) {
							continue;
						}
						const parts = yield* splitStorageKey(item.Key);
						if (recursive) {
							yield* remember(parts.folder);
						}
						files.push({
							contentType: yield* contentTypeFromName(parts.name),
							...(item.LastModified === undefined
								? {}
								: { createdAt: item.LastModified.toISOString() }),
							key: item.Key,
							size: item.Size ?? 0,
						});
					}
					for (const item of page.CommonPrefixes ?? []) {
						if (item.Prefix !== undefined) {
							yield* remember(item.Prefix.replace(/\/$/, ''));
						}
					}
					token = page.IsTruncated ? page.NextContinuationToken : undefined;
					if (page.IsTruncated === true && token === undefined) {
						truncated = true;
					}
				} while (token !== undefined);
				return { files, folders: [...folderSet], truncated };
			});

			// Uploads bytes under a key so the bucket holds the object the drive lists later.
			const put = Effect.fn('R2.put')(function* (
				key: string,
				bytes: Uint8Array,
				contentType: string,
			) {
				if (config.r2 === undefined) {
					return yield* unavailable('r2');
				}
				yield* send(
					new PutObjectCommand({
						Body: bytes,
						Bucket: config.r2.bucket,
						ContentType: contentType,
						Key: key,
					}),
				);
			});

			const journalKey = 'r2-uploads';
			let swept = false;

			const readRange = Effect.fn('R2.readRange')(function* (
				filePath: string,
				offset: number,
				length: number,
			) {
				return yield* Effect.scoped(
					Effect.gen(function* () {
						const handle = yield* fs
							.open(filePath)
							.pipe(
								Effect.mapError(
									() => new StorageError({ message: 'Could not read the uploaded temporary file' }),
								),
							);
						const output = new Uint8Array(length);
						const chunk = new Uint8Array(1024 * 1024);
						let filled = 0;
						let position = BigInt(offset);
						while (filled < length) {
							const count = yield* handle
								.read(chunk, { position })
								.pipe(
									Effect.mapError(
										() =>
											new StorageError({ message: 'Could not read the uploaded temporary file' }),
									),
								);
							if (count === 0) {
								return yield* new StorageError({
									message: 'Could not read the uploaded temporary file',
								});
							}
							const take = Math.min(count, length - filled);
							output.set(chunk.subarray(0, take), filled);
							filled += take;
							position += BigInt(take);
						}
						return output;
					}),
				);
			});

			// Keeps unfinished multipart ids so a later upload can abort them after a crash.
			const updateJournal = Effect.fn('R2.updateJournal')(function* (
				use: (
					rows: ReadonlyArray<{ readonly key: string; readonly uploadId: string }>,
				) => ReadonlyArray<{ readonly key: string; readonly uploadId: string }>,
			) {
				for (let attempt = 0; attempt < 8; attempt++) {
					const text = yield* store
						.readDoc(journalKey)
						.pipe(
							Effect.mapError(
								() => new StorageError({ message: 'Could not record the R2 upload' }),
							),
						);
					const rows = text === undefined ? [] : yield* pendingUploads(text);
					const swapped = yield* store
						.compareAndSwap(journalKey, text, JSON.stringify(use(rows)))
						.pipe(
							Effect.mapError(
								() => new StorageError({ message: 'Could not record the R2 upload' }),
							),
						);
					if (swapped === 'ok') {
						return;
					}
				}
				return yield* new StorageError({ message: 'Could not record the R2 upload' });
			});

			const sweep = Effect.fn('R2.sweep')(function* () {
				if (swept || client === undefined || config.r2 === undefined) {
					return;
				}
				swept = true;
				const text = yield* store
					.readDoc(journalKey)
					.pipe(Effect.catch(() => Effect.succeed(undefined)));
				const rows = text === undefined ? [] : yield* pendingUploads(text);
				for (const upload of rows) {
					const aborted = yield* send(
						new AbortMultipartUploadCommand({
							Bucket: config.r2.bucket,
							Key: upload.key,
							UploadId: upload.uploadId,
						}),
					).pipe(Effect.result);
					const gone =
						Result.isFailure(aborted) &&
						aborted.failure.message.toLowerCase().includes('nosuchupload');
					if (Result.isSuccess(aborted) || gone) {
						yield* updateJournal((current) =>
							current.filter((item) => item.uploadId !== upload.uploadId),
						).pipe(Effect.ignore);
					}
				}
			});

			// Reads the temporary file in parts so one request never holds the whole object.
			const putFile = Effect.fn('R2.putFile')(function* (
				key: string,
				filePath: string,
				size: number,
				contentType: string,
			) {
				if (config.r2 === undefined) {
					return yield* unavailable('r2');
				}
				yield* sweep();
				const bucket = config.r2.bucket;
				const parts = yield* uploadParts(size, yield* uploadPartBytes(size));
				if (parts.length <= 1) {
					const body = size === 0 ? new Uint8Array() : yield* readRange(filePath, 0, size);
					yield* send(
						new PutObjectCommand({
							Body: body,
							Bucket: bucket,
							ContentLength: size,
							ContentType: contentType,
							Key: key,
						}),
					);
					return;
				}
				const created = yield* send<{ readonly UploadId?: string }>(
					new CreateMultipartUploadCommand({
						Bucket: bucket,
						ContentType: contentType,
						Key: key,
					}),
				);
				const uploadId = created.UploadId;
				if (uploadId === undefined) {
					return yield* new StorageError({ message: 'R2 did not start the upload' });
				}
				yield* updateJournal((rows) => [...rows, { key, uploadId }]);
				const abort = send(
					new AbortMultipartUploadCommand({
						Bucket: bucket,
						Key: key,
						UploadId: uploadId,
					}),
				).pipe(Effect.ignore);
				const forget = updateJournal((rows) =>
					rows.filter((item) => item.uploadId !== uploadId),
				).pipe(Effect.ignore);
				yield* Effect.gen(function* () {
					const completed: Array<{ readonly ETag: string; readonly PartNumber: number }> = [];
					for (const part of parts) {
						const body = yield* readRange(filePath, part.offset, part.length);
						const output = yield* send<{ readonly ETag?: string }>(
							new UploadPartCommand({
								Body: body,
								Bucket: bucket,
								ContentLength: part.length,
								Key: key,
								PartNumber: part.number,
								UploadId: uploadId,
							}),
						);
						if (output.ETag === undefined) {
							return yield* new StorageError({ message: 'R2 did not accept an upload part' });
						}
						completed.push({ ETag: output.ETag, PartNumber: part.number });
					}
					yield* send(
						new CompleteMultipartUploadCommand({
							Bucket: bucket,
							Key: key,
							MultipartUpload: { Parts: completed },
							UploadId: uploadId,
						}),
					);
				}).pipe(
					Effect.tapError(() => abort),
					Effect.tap(() => forget),
					Effect.tapError(() => forget),
				);
			});

			// Opens an object as a byte stream so a download does not hold the whole file in memory.
			const open = Effect.fn('R2.open')(function* (key: string) {
				if (config.r2 === undefined) {
					return yield* unavailable('r2');
				}
				const output = yield* send<{ readonly Body?: unknown }>(
					new GetObjectCommand({ Bucket: config.r2.bucket, Key: key }),
				);
				const web = objectWebStream(output.Body);
				if (web === undefined) {
					return yield* new StorageError({ message: 'R2 returned no file content' });
				}
				return Stream.fromReadableStream({
					evaluate: () => web,
					onError: () => new StorageError({ message: 'R2 download failed' }),
				});
			});

			// Downloads an object body for moves that still need the bytes.
			const get = Effect.fn('R2.get')(function* (key: string) {
				if (config.r2 === undefined) {
					return yield* unavailable('r2');
				}
				const output = yield* send<{
					readonly Body?: { transformToByteArray: () => Promise<Uint8Array> };
				}>(new GetObjectCommand({ Bucket: config.r2.bucket, Key: key }));
				if (output.Body === undefined) {
					return yield* new StorageError({ message: 'R2 returned no file content' });
				}
				return yield* Effect.tryPromise({
					catch: () => new StorageError({ message: 'R2 download failed' }),
					try: () => output.Body!.transformToByteArray(),
				});
			});

			// Removes an object after the index has decided the file or folder marker should go.
			const remove = Effect.fn('R2.delete')(function* (key: string) {
				if (config.r2 === undefined) {
					return yield* unavailable('r2');
				}
				yield* send(new DeleteObjectCommand({ Bucket: config.r2.bucket, Key: key }));
			});

			// Copies within the bucket before deleting the old key, so a move does not re-upload the bytes.
			const copy = Effect.fn('R2.copy')(function* (from: string, to: string) {
				if (config.r2 === undefined) {
					return yield* unavailable('r2');
				}
				const source = from
					.split('/')
					.map((part) => encodeURIComponent(part))
					.join('/');
				yield* send(
					new CopyObjectCommand({
						Bucket: config.r2.bucket,
						CopySource: `${config.r2.bucket}/${source}`,
						Key: to,
					}),
				);
			});

			// Confirms the bucket is reachable so the source list can show a connected bucket name.
			const status = Effect.fn('R2.status')(function* () {
				if (config.r2 === undefined) {
					return 'Not configured';
				}
				yield* send(new HeadBucketCommand({ Bucket: config.r2.bucket }));
				return `Connected ${config.r2.bucket}`;
			});

			return R2.of({
				configured: config.r2 !== undefined,
				copy,
				delete: remove,
				get,
				open,
				list,
				put,
				putFile,
				status,
			});
		}),
	);
}
