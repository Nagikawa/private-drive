import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import { mkdir, open, readFile, readdir, rename, rm, stat, writeFile, appendFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { AppConfig } from '../config.ts';
import { StateError, StateStore } from './store.ts';

const tails = new Map<string, Promise<unknown>>();

// Keeps two requests from rewriting the same file at the same time.
const exclusive = <A>(key: string, run: () => Promise<A>): Promise<A> => {
	const previous = tails.get(key) ?? Promise.resolve();
	const result = previous.then(run, run);
	tails.set(
		key,
		result.then(
			() => undefined,
			() => undefined,
		),
	);
	return result;
};

const missing = (cause: unknown): boolean =>
	typeof cause === 'object' &&
	cause !== null &&
	'code' in cause &&
	(cause.code === 'ENOENT' || cause.code === 'ENOTDIR');

const docPath = (dataDir: string, key: string): string => {
	switch (key) {
		case 'sessions':
			return join(dataDir, 'sessions.json');
		case 'audit':
			return join(dataDir, 'audit.jsonl');
		case 'uploads':
			return join(dataDir, 'uploads', 'sessions.json');
		case 'r2-uploads':
			return join(dataDir, 'r2-uploads.json');
		default:
			return join(dataDir, key);
	}
};

const failed = (message: string) => new StateError({ message });

// The Node process keeps the same files the API already used under DATA_DIR.
export const NodeState = Layer.effect(
	StateStore,
	Effect.gen(function* () {
		const config = yield* AppConfig;
		const dataDir = config.dataDir;

		const readText = (path: string) =>
			exclusive(path, async () => {
				try {
					return await readFile(path, 'utf8');
				} catch (cause) {
					if (missing(cause)) {
						return undefined;
					}
					throw cause;
				}
			});

		const writeText = async (path: string, text: string) => {
			await mkdir(dirname(path), { recursive: true });
			const temporary = `${path}.${crypto.randomUUID()}.tmp`;
			await writeFile(temporary, text);
			await rename(temporary, path);
		};

		return StateStore.of({
			readDoc: (key) =>
				Effect.tryPromise({
					catch: () => failed('Could not read stored state'),
					try: () => readText(docPath(dataDir, key)),
				}),
			compareAndSwap: (key, expected, next) =>
				Effect.tryPromise({
					catch: () => failed('Could not update stored state'),
					try: () =>
						exclusive(docPath(dataDir, key), async () => {
							const path = docPath(dataDir, key);
							let current: string | undefined;
							try {
								current = await readFile(path, 'utf8');
							} catch (cause) {
								if (!missing(cause)) {
									throw cause;
								}
								current = undefined;
							}
							if (current !== expected) {
								return 'conflict' as const;
							}
							await writeText(path, next);
							return 'ok' as const;
						}),
				}),
			appendDoc: (key, line) =>
				Effect.tryPromise({
					catch: () => failed('Could not append stored state'),
					try: () =>
						exclusive(docPath(dataDir, key), async () => {
							const path = docPath(dataDir, key);
							await mkdir(dirname(path), { recursive: true });
							await appendFile(path, `${line}\n`, 'utf8');
						}),
				}),
			writeAt: (path, offset, bytes) =>
				Effect.tryPromise({
					catch: () => failed('Could not write stored bytes'),
					try: () =>
						exclusive(path, async () => {
							await mkdir(dirname(path), { recursive: true });
							let handle;
							try {
								handle = await open(path, 'r+');
							} catch (cause) {
								if (!missing(cause)) {
									throw cause;
								}
								handle = await open(path, 'w+');
							}
							try {
								if (bytes.byteLength > 0) {
									await handle.write(bytes, 0, bytes.byteLength, offset);
								}
							} finally {
								await handle.close();
							}
						}),
				}),
			readAt: (path, offset, length) =>
				Effect.tryPromise({
					catch: () => failed('Could not read stored bytes'),
					try: () =>
						exclusive(path, async () => {
							const handle = await open(path, 'r');
							try {
								const buffer = Buffer.alloc(length);
								const read = await handle.read(buffer, 0, length, offset);
								return new Uint8Array(buffer.subarray(0, read.bytesRead));
							} finally {
								await handle.close();
							}
						}),
				}),
			size: (path) =>
				Effect.tryPromise({
					catch: () => failed('Could not stat stored bytes'),
					try: () =>
						exclusive(path, async () => {
							try {
								return (await stat(path)).size;
							} catch (cause) {
								if (missing(cause)) {
									return undefined;
								}
								throw cause;
							}
						}),
				}),
			remove: (path) =>
				Effect.tryPromise({
					catch: () => failed('Could not remove stored bytes'),
					try: () => exclusive(path, () => rm(path, { force: true })),
				}),
			removePrefix: (prefix) =>
				Effect.tryPromise({
					catch: () => failed('Could not remove stored bytes'),
					try: () => exclusive(prefix, () => rm(prefix, { force: true, recursive: true })),
				}),
			rename: (from, to) =>
				Effect.tryPromise({
					catch: () => failed('Could not rename stored bytes'),
					try: () =>
						exclusive(from, async () => {
							await mkdir(dirname(to), { recursive: true });
							await rename(from, to);
						}),
				}),
			list: (prefix) =>
				Effect.tryPromise({
					catch: () => failed('Could not list stored bytes'),
					try: () =>
						exclusive(prefix, async () => {
							try {
								const names = await readdir(prefix);
								return names.map((name) => join(prefix, name));
							} catch (cause) {
								if (missing(cause)) {
									return [];
								}
								throw cause;
							}
						}),
				}),
		});
	}),
);
