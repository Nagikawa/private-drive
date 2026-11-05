import * as Vitest from '@effect/vitest';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import * as Layer from 'effect/Layer';
import * as Scope from 'effect/Scope';

import { signContent } from '../src/auth/share.ts';
import { Server } from '../src/server.ts';
import { configFor, tempDirectory } from './support.ts';

Vitest.describe('Server', () => {
	// The process answers health, hides files from an anonymous caller, and rejects a bad password.
	Vitest.it.effect('serves health, a protected file route, and login', () =>
		Effect.gen(function* () {
			const directory = yield* tempDirectory;
			const scope = yield* Scope.make();
			yield* Effect.addFinalizer(() => Scope.close(scope, Exit.void));
			const port = 18_791;
			yield* Layer.buildWithScope(
				Server.pipe(Layer.provide(configFor(directory, { PORT: String(port) }))),
				scope,
			);
			const health = yield* Effect.tryPromise({
				try: () => fetch(`http://127.0.0.1:${port}/health`),
				catch: () => new Error('Health request failed'),
			});
			Vitest.expect(health.status).toBe(200);
			const healthBody: unknown = yield* Effect.tryPromise({
				try: () => health.json(),
				catch: () => new Error('Health body failed'),
			});
			Vitest.expect(healthBody).toEqual({ ok: true });
			const hidden = yield* Effect.tryPromise({
				try: () => fetch(`http://127.0.0.1:${port}/api/files/missing/content`),
				catch: () => new Error('Content request failed'),
			});
			Vitest.expect(hidden.status).toBe(401);
			const expiresAt = Date.now() + 60_000;
			const signature = signContent('test-secret', 'missing', expiresAt);
			const signed = yield* Effect.tryPromise({
				try: () =>
					fetch(
						`http://127.0.0.1:${port}/api/files/missing/content?exp=${expiresAt}&sig=${encodeURIComponent(signature)}`,
					),
				catch: () => new Error('Signed content request failed'),
			});
			Vitest.expect(signed.status).toBe(404);
			const chunk = yield* Effect.tryPromise({
				try: () =>
					fetch(`http://127.0.0.1:${port}/api/uploads/sessions/missing`, { method: 'PUT' }),
				catch: () => new Error('Upload chunk request failed'),
			});
			Vitest.expect(chunk.status).toBe(401);
			const login = yield* Effect.tryPromise({
				try: () =>
					fetch(`http://127.0.0.1:${port}/api/session/login`, {
						body: JSON.stringify({ password: 'nope' }),
						headers: { 'content-type': 'application/json' },
						method: 'POST',
					}),
				catch: () => new Error('Login request failed'),
			});
			Vitest.expect(login.status).toBe(401);
		}),
	);
});
