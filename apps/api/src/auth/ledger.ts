import { Unauthorized, type SessionBook } from '@private-drive/model';
import { activeSessions, pure, sessionBook } from '@private-drive/utils';
import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Redacted from 'effect/Redacted';

import { AppConfig } from '../config.ts';
import { StateStore } from '../state/store.ts';
import { issueSession, sessionClaims, sessionLifetime } from './session.ts';

const sessionsKey = 'sessions';

const bookFrom = (text: string | undefined) =>
	text === undefined ? Effect.succeed({} as SessionBook) : sessionBook(text);

// Remembers which session nonces are still allowed, so logout can reject a cookie before it expires.
export class SessionLedger extends Context.Service<
	SessionLedger,
	{
		readonly accept: (token: string, now: number) => Effect.Effect<boolean>;
		readonly issue: (now: number) => Effect.Effect<string, Unauthorized>;
		readonly revoke: (token: string, now: number) => Effect.Effect<void>;
	}
>()('private-drive/SessionLedger') {
	static readonly layer = Layer.effect(
		SessionLedger,
		Effect.gen(function* () {
			const config = yield* AppConfig;
			const store = yield* StateStore;
			const secret = Redacted.value(config.sessionSecret);

			// Applies one ledger change only when the stored book is still the one we read.
			const change = <A>(use: (book: SessionBook) => readonly [SessionBook, A]) =>
				Effect.gen(function* () {
					for (let attempt = 0; attempt < 8; attempt++) {
						const text = yield* store.readDoc(sessionsKey);
						const book = yield* bookFrom(text);
						const [next, value] = use(book);
						const swapped = yield* store.compareAndSwap(
							sessionsKey,
							text,
							JSON.stringify({ sessions: next }),
						);
						if (swapped === 'ok') {
							return value;
						}
					}
					return yield* Effect.fail('Could not update the session ledger');
				});

			return SessionLedger.of({
				// Issues a signed cookie and records its nonce until the cookie's own expiry.
				issue: (now) =>
					change((book) => {
						const nonce = crypto.randomUUID();
						const expiresAt = now + sessionLifetime;
						const next = pure(activeSessions(book, now), {});
						next[nonce] = expiresAt;
						return [next, issueSession(secret, expiresAt, nonce)] as const;
					}).pipe(
						Effect.mapError(() => new Unauthorized({ message: 'Could not start the session' })),
					),
				// Accepts a cookie only when the signature is valid and logout has not removed the nonce.
				accept: (token, now) =>
					Effect.gen(function* () {
						const claims = sessionClaims(secret, token, now);
						if (claims === undefined) {
							return false;
						}
						const text = yield* store
							.readDoc(sessionsKey)
							.pipe(Effect.catch(() => Effect.succeed(undefined)));
						const book = yield* bookFrom(text);
						return book[claims.nonce] === claims.expiresAt;
					}),
				// Drops the nonce so a copied cookie cannot be used after logout.
				revoke: (token, now) =>
					change((book) => {
						const claims = sessionClaims(secret, token, now);
						const next = pure(activeSessions(book, now), {});
						if (claims !== undefined) {
							delete next[claims.nonce];
						}
						return [next, undefined] as const;
					}).pipe(Effect.catch(() => Effect.void)),
			});
		}),
	);
}
