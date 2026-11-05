import * as Vitest from '@effect/vitest';
import { CurrentAccount, Session } from '@private-drive/domain';
import { Account, Unauthorized } from '@private-drive/model';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Redacted from 'effect/Redacted';
import * as Result from 'effect/Result';

import { SessionLedger } from '../src/auth/ledger.ts';
import {
	cookieOptions,
	issueSession,
	sameSecret,
	sessionClaims,
	sessionLifetime,
	SessionLive,
} from '../src/auth/session.ts';

Vitest.describe('session tokens', () => {
	// Login compares digests, so two different passwords never compare as the stored one.
	Vitest.it.effect('matches a password only when both sides are the same', () =>
		Effect.sync(() => {
			Vitest.expect(sameSecret('secret', 'admin', 'admin')).toBe(true);
			Vitest.expect(sameSecret('secret', 'admin', 'other')).toBe(false);
		}),
	);

	// Logout can revoke the nonce only when the cookie still parses to the same expiry.
	Vitest.it.effect('round-trips a cookie and rejects a bad or expired one', () =>
		Effect.sync(() => {
			const token = issueSession('secret', 5_000, 'nonce-1');
			Vitest.expect(sessionClaims('secret', token, 1_000)).toEqual({
				expiresAt: 5_000,
				nonce: 'nonce-1',
			});
			Vitest.expect(sessionClaims('secret', token, 5_000)).toBeUndefined();
			Vitest.expect(sessionClaims('other', token, 1_000)).toBeUndefined();
			Vitest.expect(sessionClaims('secret', '1.2.3.4', 0)).toBeUndefined();
			Vitest.expect(sessionLifetime).toBe(7 * 24 * 60 * 60 * 1000);
		}),
	);

	// Clearing the cookie uses a zero lifetime so the browser drops it immediately.
	Vitest.it.effect('builds cookie flags for a week, or clears them', () =>
		Effect.sync(() => {
			Vitest.expect(cookieOptions(true, false)).toMatchObject({
				httpOnly: true,
				maxAge: sessionLifetime,
				secure: true,
			});
			Vitest.expect(cookieOptions(false, true).maxAge).toBe(0);
		}),
	);
});

Vitest.describe('SessionLive', () => {
	// A cookie the ledger still holds becomes the current account. Anything else stays logged out.
	Vitest.it.effect('accepts a recorded cookie and rejects the rest', () =>
		Effect.gen(function* () {
			const session = yield* Session;
			const allowed = yield* session.session(
				Effect.gen(function* () {
					return yield* CurrentAccount;
				}),
				{ credential: Redacted.make('good') },
			);
			Vitest.expect(allowed).toBeInstanceOf(Account);
			const rejected = yield* session
				.session(Effect.succeed(new Account({})), { credential: Redacted.make('bad') })
				.pipe(Effect.result);
			Vitest.expect(Result.isFailure(rejected) && rejected.failure).toBeInstanceOf(Unauthorized);
		}).pipe(
			Effect.provide(
				SessionLive.pipe(
					Layer.provide(
						Layer.succeed(SessionLedger, {
							accept: (token) => Effect.succeed(token === 'good'),
							issue: () => Effect.succeed('issued'),
							revoke: () => Effect.void,
						}),
					),
				),
			),
		),
	);
});
