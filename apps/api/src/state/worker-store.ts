import { env } from 'cloudflare:workers';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Schema from 'effect/Schema';

import { StateError, StateStore } from './store.ts';

const origin = 'https://drive-state';

const stub = () => {
	const id = env.DRIVE_STATE.idFromName('private-drive');
	return env.DRIVE_STATE.get(id);
};

const call = (path: string, init?: RequestInit) =>
	Effect.tryPromise({
		catch: () => new StateError({ message: 'Could not reach stored state' }),
		try: () => stub().fetch(new Request(`${origin}${path}`, init)),
	});

const requireOk = (response: Response) =>
	response.ok
		? Effect.succeed(response)
		: Effect.fail(new StateError({ message: 'Could not update stored state' }));

const CasResult = Schema.Struct({
	status: Schema.Literals(['ok', 'conflict']),
});

const SizeResult = Schema.Struct({
	size: Schema.NullOr(Schema.Number),
});

const ListResult = Schema.Struct({
	paths: Schema.Array(Schema.String),
});

const jsonRequest = (body: unknown): RequestInit => ({
	body: JSON.stringify(body),
	headers: { 'content-type': 'application/json' },
	method: 'POST',
});

// Talks to the single DriveState object. Call this only while a request is running.
export const WorkerState = Layer.succeed(
	StateStore,
	StateStore.of({
		readDoc: (key) =>
			Effect.gen(function* () {
				const response = yield* call(`/doc?key=${encodeURIComponent(key)}`);
				if (response.status === 404) {
					return undefined;
				}
				yield* requireOk(response);
				return yield* Effect.tryPromise({
					catch: () => new StateError({ message: 'Could not read stored state' }),
					try: () => response.text(),
				});
			}),
		compareAndSwap: (key, expected, next) =>
			Effect.gen(function* () {
				const response = yield* call(
					'/cas',
					jsonRequest({ expected: expected ?? null, key, value: next }),
				);
				yield* requireOk(response);
				const body = yield* Effect.tryPromise({
					catch: () => new StateError({ message: 'Could not update stored state' }),
					try: () => response.json(),
				});
				const parsed = yield* Schema.decodeUnknownEffect(CasResult)(body).pipe(
					Effect.mapError(() => new StateError({ message: 'Could not update stored state' })),
				);
				return parsed.status;
			}),
		appendDoc: (_key, line) =>
			Effect.gen(function* () {
				const response = yield* call('/append', jsonRequest({ line }));
				yield* requireOk(response);
			}),
		writeAt: (path, offset, bytes) =>
			Effect.gen(function* () {
				const response = yield* call(
					`/bytes?path=${encodeURIComponent(path)}&offset=${offset}`,
					{ body: bytes.slice().buffer, method: 'PUT' },
				);
				yield* requireOk(response);
			}),
		readAt: (path, offset, length) =>
			Effect.gen(function* () {
				const response = yield* call(
					`/bytes?path=${encodeURIComponent(path)}&offset=${offset}&length=${length}`,
				);
				if (response.status === 404) {
					return yield* new StateError({ message: 'Stored bytes are missing' });
				}
				yield* requireOk(response);
				const buffer = yield* Effect.tryPromise({
					catch: () => new StateError({ message: 'Could not read stored bytes' }),
					try: () => response.arrayBuffer(),
				});
				return new Uint8Array(buffer);
			}),
		size: (path) =>
			Effect.gen(function* () {
				const response = yield* call(`/size?path=${encodeURIComponent(path)}`);
				yield* requireOk(response);
				const body = yield* Effect.tryPromise({
					catch: () => new StateError({ message: 'Could not stat stored bytes' }),
					try: () => response.json(),
				});
				const parsed = yield* Schema.decodeUnknownEffect(SizeResult)(body).pipe(
					Effect.mapError(() => new StateError({ message: 'Could not stat stored bytes' })),
				);
				return parsed.size ?? undefined;
			}),
		remove: (path) =>
			Effect.gen(function* () {
				const response = yield* call(`/remove?path=${encodeURIComponent(path)}`, {
					method: 'POST',
				});
				yield* requireOk(response);
			}),
		removePrefix: (prefix) =>
			Effect.gen(function* () {
				const response = yield* call(`/remove-prefix?prefix=${encodeURIComponent(prefix)}`, {
					method: 'POST',
				});
				yield* requireOk(response);
			}),
		rename: (from, to) =>
			Effect.gen(function* () {
				const response = yield* call('/rename', jsonRequest({ from, to }));
				yield* requireOk(response);
			}),
		list: (prefix) =>
			Effect.gen(function* () {
				const response = yield* call(`/list?prefix=${encodeURIComponent(prefix)}`);
				yield* requireOk(response);
				const body = yield* Effect.tryPromise({
					catch: () => new StateError({ message: 'Could not list stored bytes' }),
					try: () => response.json(),
				});
				const parsed = yield* Schema.decodeUnknownEffect(ListResult)(body).pipe(
					Effect.mapError(() => new StateError({ message: 'Could not list stored bytes' })),
				);
				return parsed.paths;
			}),
	}),
);
