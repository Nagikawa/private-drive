import * as ByteSize from 'effect/ByteSize';
import * as Effect from 'effect/Effect';
import * as FileSystem from 'effect/FileSystem';
import * as Layer from 'effect/Layer';
import * as Option from 'effect/Option';
import * as PlatformError from 'effect/PlatformError';
import * as Sink from 'effect/Sink';

import { StateStore } from './store.ts';

const info = (size: number, type: FileSystem.File.Type): FileSystem.File.Info => ({
	atime: Option.none(),
	birthtime: Option.none(),
	blksize: Option.none(),
	blocks: Option.none(),
	dev: 0n,
	gid: Option.none(),
	ino: Option.none(),
	mode: 0o644,
	mtime: Option.none(),
	nlink: Option.none(),
	rdev: Option.none(),
	size: ByteSize.bytes(size),
	type,
	uid: Option.none(),
});

const platform = (method: string, path: string, description: string) =>
	PlatformError.systemError({
		_tag: 'Unknown',
		description,
		method,
		module: 'FileSystem',
		pathOrDescriptor: path,
	});

const missing = (method: string, path: string) =>
	PlatformError.systemError({
		_tag: 'NotFound',
		method,
		module: 'FileSystem',
		pathOrDescriptor: path,
	});

// Presents Durable Object bytes as the FileSystem the upload routes already call.
export const WorkerFileSystem = {
	layer: Layer.effect(
		FileSystem.FileSystem,
		Effect.gen(function* () {
			const store = yield* StateStore;

			const asPlatform =
				(method: string, path: string) =>
				<A, E, R>(effect: Effect.Effect<A, E, R>) =>
					effect.pipe(
						Effect.mapError((error) =>
							platform(
								method,
								path,
								typeof error === 'object' &&
									error !== null &&
									'message' in error &&
									typeof error.message === 'string'
									? error.message
									: 'Could not use stored bytes',
							),
						),
					);

			const open = Effect.fn('WorkerFileSystem.open')(function* (
				path: string,
				options?: { readonly flag?: string },
			) {
				const flag = options?.flag ?? 'r';
				if (flag.startsWith('w')) {
					yield* store.remove(path).pipe(Effect.ignore);
					yield* asPlatform('open', path)(store.writeAt(path, 0, new Uint8Array()));
				}
				const current = yield* asPlatform('open', path)(store.size(path));
				if (current === undefined && flag.startsWith('r')) {
					return yield* missing('open', path);
				}
				let cursor = flag.startsWith('a') ? (current ?? 0) : 0;
				const file: FileSystem.File = {
					[FileSystem.FileTypeId]: FileSystem.FileTypeId,
					stat: Effect.gen(function* () {
						const size = (yield* asPlatform('stat', path)(store.size(path))) ?? 0;
						return info(size, 'File');
					}),
					seek: (offset, _from) =>
						Effect.gen(function* () {
							if (offset < 0n) {
								return yield* PlatformError.badArgument({
									description: 'Seek starts before the file',
									method: 'seek',
									module: 'FileSystem',
								});
							}
							cursor = Number(offset);
							return offset;
						}),
					sync: Effect.void,
					read: (buffer, readOptions) =>
						Effect.gen(function* () {
							const position =
								readOptions?.position === undefined ? BigInt(cursor) : readOptions.position;
							if (position < 0n) {
								return yield* PlatformError.badArgument({
									description: 'Read starts before the file',
									method: 'read',
									module: 'FileSystem',
								});
							}
							const size = (yield* asPlatform('read', path)(store.size(path))) ?? 0;
							if (position >= BigInt(size) || buffer.byteLength === 0) {
								return 0;
							}
							const length = Math.min(buffer.byteLength, size - Number(position));
							const bytes = yield* asPlatform(
								'read',
								path,
							)(store.readAt(path, Number(position), length));
							buffer.set(bytes.subarray(0, bytes.byteLength));
							if (readOptions?.position === undefined) {
								cursor += bytes.byteLength;
							}
							return bytes.byteLength;
						}),
					readAlloc: (size, readOptions) =>
						Effect.gen(function* () {
							const buffer = new Uint8Array(size);
							const count = yield* file.read(buffer, readOptions);
							return count === 0 ? Option.none() : Option.some(buffer.subarray(0, count));
						}),
					truncate: (length) =>
						Effect.gen(function* () {
							const next = length ?? 0;
							if (next === 0) {
								yield* asPlatform('truncate', path)(store.remove(path));
								yield* asPlatform('truncate', path)(store.writeAt(path, 0, new Uint8Array()));
							}
							cursor = Math.min(cursor, next);
						}),
					write: (buffer) =>
						Effect.gen(function* () {
							yield* asPlatform('write', path)(store.writeAt(path, cursor, buffer));
							cursor += buffer.byteLength;
							return buffer.byteLength;
						}),
					writeAll: (buffer) =>
						Effect.gen(function* () {
							yield* file.write(buffer);
						}),
				};
				return file;
			});

			return FileSystem.makeNoop({
				exists: (path) =>
					Effect.gen(function* () {
						const size = yield* store.size(path).pipe(Effect.catch(() => Effect.succeed(undefined)));
						if (size !== undefined) {
							return true;
						}
						const children = yield* store
							.list(path)
							.pipe(Effect.catch(() => Effect.succeed([] as ReadonlyArray<string>)));
						return children.length > 0;
					}),
				makeDirectory: (path) =>
					asPlatform('makeDirectory', path)(store.writeAt(`${path}/.keep`, 0, new Uint8Array())),
				makeTempDirectory: (options) =>
					Effect.sync(
						() => `${options?.directory ?? 'tmp'}/${options?.prefix ?? ''}${crypto.randomUUID()}`,
					),
				makeTempDirectoryScoped: (options) =>
					Effect.gen(function* () {
						const directory = `${options?.directory ?? 'tmp'}/${options?.prefix ?? ''}${crypto.randomUUID()}`;
						yield* asPlatform(
							'makeTempDirectory',
							directory,
						)(store.writeAt(`${directory}/.keep`, 0, new Uint8Array()));
						yield* Effect.addFinalizer(() => store.removePrefix(directory).pipe(Effect.ignore));
						return directory;
					}),
				makeTempFile: (options) =>
					Effect.sync(
						() =>
							`${options?.directory ?? 'tmp'}/${options?.prefix ?? ''}${crypto.randomUUID()}${options?.suffix ?? ''}`,
					),
				makeTempFileScoped: (options) =>
					Effect.gen(function* () {
						const path = `${options?.directory ?? 'tmp'}/${options?.prefix ?? ''}${crypto.randomUUID()}${options?.suffix ?? ''}`;
						yield* asPlatform('makeTempFile', path)(store.writeAt(path, 0, new Uint8Array()));
						yield* Effect.addFinalizer(() => store.remove(path).pipe(Effect.ignore));
						return path;
					}),
				open: (path, options) => open(path, options),
				readFile: (path) =>
					Effect.gen(function* () {
						const size = yield* asPlatform('readFile', path)(store.size(path));
						if (size === undefined) {
							return yield* missing('readFile', path);
						}
						return yield* asPlatform('readFile', path)(store.readAt(path, 0, size));
					}),
				readFileString: (path) =>
					Effect.gen(function* () {
						const size = yield* asPlatform('readFileString', path)(store.size(path));
						if (size === undefined) {
							return yield* missing('readFileString', path);
						}
						const file = yield* asPlatform('readFileString', path)(store.readAt(path, 0, size));
						return new TextDecoder().decode(file);
					}),
				remove: (path, options) =>
					asPlatform(
						'remove',
						path,
					)(options?.recursive === true ? store.removePrefix(path) : store.remove(path)),
				rename: (from, to) => asPlatform('rename', from)(store.rename(from, to)),
				sink: (path) =>
					Sink.unwrap(
						Effect.gen(function* () {
							yield* store.remove(path).pipe(Effect.ignore);
							yield* asPlatform('sink', path)(store.writeAt(path, 0, new Uint8Array()));
							let offset = 0;
							return Sink.forEach((chunk: Uint8Array) =>
								Effect.gen(function* () {
									if (chunk.byteLength === 0) {
										return;
									}
									yield* asPlatform('sink', path)(store.writeAt(path, offset, chunk));
									offset += chunk.byteLength;
								}),
							);
						}),
					),
				stat: (path) =>
					Effect.gen(function* () {
						const size = yield* store.size(path).pipe(Effect.catch(() => Effect.succeed(undefined)));
						if (size !== undefined) {
							return info(size, 'File');
						}
						const children = yield* store
							.list(path)
							.pipe(Effect.catch(() => Effect.succeed([] as ReadonlyArray<string>)));
						if (children.length > 0) {
							return info(0, 'Directory');
						}
						return yield* missing('stat', path);
					}),
				writeFile: (path, data) =>
					Effect.gen(function* () {
						yield* store.remove(path).pipe(Effect.ignore);
						yield* asPlatform('writeFile', path)(store.writeAt(path, 0, data));
					}),
				writeFileString: (path, data) =>
					Effect.gen(function* () {
						yield* store.remove(path).pipe(Effect.ignore);
						yield* asPlatform(
							'writeFileString',
							path,
						)(store.writeAt(path, 0, new TextEncoder().encode(data)));
					}),
			});
		}),
	),
};
