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
import {
	StorageError,
	contentTypeFromName,
	parentFolder,
	splitStorageKey,
	uploadPartBytes,
	uploadParts,
} from '@private-drive/domain';
import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Path from 'effect/Path';
import * as Predicate from 'effect/Predicate';
import * as Redacted from 'effect/Redacted';
import * as Result from 'effect/Result';
import * as Stream from 'effect/Stream';
import { createReadStream } from 'node:fs';

import { AppConfig } from '../config.ts';
import { forgetUpload, readPendingUploads, rememberUpload } from './r2-uploads.ts';
import { unavailable, type RemoteFile, type RemoteListing } from './shared.ts';

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
			const path = yield* Path.Path;
			const pendingPath = path.join(config.dataDir, 'r2-uploads.json');
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

			// Streams a large file in parts so the process never holds the whole object in one buffer.
			const putFile = Effect.fn('R2.putFile')(function* (
				key: string,
				path: string,
				size: number,
				contentType: string,
			) {
				if (config.r2 === undefined) {
					return yield* unavailable('r2');
				}
				const bucket = config.r2.bucket;
				const parts = uploadParts(size, uploadPartBytes(size));
				if (parts.length <= 1) {
					if (size === 0) {
						yield* send(
							new PutObjectCommand({
								Body: new Uint8Array(),
								Bucket: bucket,
								ContentType: contentType,
								Key: key,
							}),
						);
						return;
					}
					yield* Effect.acquireUseRelease(
						Effect.sync(() => createReadStream(path)),
						(body) =>
							send(
								new PutObjectCommand({
									Body: body,
									Bucket: bucket,
									ContentLength: size,
									ContentType: contentType,
									Key: key,
								}),
							),
						(body) => Effect.sync(() => body.destroy()),
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
				yield* Effect.tryPromise({
					catch: () => new StorageError({ message: 'Could not record the R2 upload' }),
					try: () => rememberUpload(pendingPath, { key, uploadId }),
				});
				const abort = send(
					new AbortMultipartUploadCommand({
						Bucket: bucket,
						Key: key,
						UploadId: uploadId,
					}),
				).pipe(Effect.ignore);
				const forget = Effect.tryPromise({
					catch: () => undefined,
					try: () => forgetUpload(pendingPath, uploadId),
				}).pipe(Effect.ignore);
				yield* Effect.gen(function* () {
					const completed: Array<{ readonly ETag: string; readonly PartNumber: number }> = [];
					for (const part of parts) {
						const output = yield* Effect.acquireUseRelease(
							Effect.sync(() =>
								createReadStream(path, {
									end: part.offset + part.length - 1,
									start: part.offset,
								}),
							),
							(body) =>
								send<{ readonly ETag?: string }>(
									new UploadPartCommand({
										Body: body,
										Bucket: bucket,
										ContentLength: part.length,
										Key: key,
										PartNumber: part.number,
										UploadId: uploadId,
									}),
								),
							(body) => Effect.sync(() => body.destroy()),
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
				const output = yield* send<{
					readonly Body?: { readonly transformToWebStream: () => ReadableStream<Uint8Array> };
				}>(new GetObjectCommand({ Bucket: config.r2.bucket, Key: key }));
				const body = output.Body;
				if (body === undefined) {
					return yield* new StorageError({ message: 'R2 returned no file content' });
				}
				return Stream.fromReadableStream({
					evaluate: () => body.transformToWebStream(),
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

			// A crash leaves the multipart id on disk. Abort it before the server accepts another upload.
			if (client !== undefined && config.r2 !== undefined) {
				const bucket = config.r2.bucket;
				const pending = yield* Effect.tryPromise({
					catch: () => [] as ReadonlyArray<{ readonly key: string; readonly uploadId: string }>,
					try: () => readPendingUploads(pendingPath),
				}).pipe(
					Effect.catch(() =>
						Effect.succeed(
							[] as ReadonlyArray<{ readonly key: string; readonly uploadId: string }>,
						),
					),
				);
				for (const upload of pending) {
					const aborted = yield* send(
						new AbortMultipartUploadCommand({
							Bucket: bucket,
							Key: upload.key,
							UploadId: upload.uploadId,
						}),
					).pipe(Effect.result);
					const missing =
						Result.isFailure(aborted) &&
						aborted.failure.message.toLowerCase().includes('nosuchupload');
					if (Result.isSuccess(aborted) || missing) {
						yield* Effect.tryPromise({
							catch: () => undefined,
							try: () => forgetUpload(pendingPath, upload.uploadId),
						}).pipe(Effect.ignore);
					}
				}
			}

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
