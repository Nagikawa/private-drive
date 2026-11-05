import { Account, CurrentAccount, Session, Unauthorized } from '@private-drive/domain';
import * as DateTime from 'effect/DateTime';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Redacted from 'effect/Redacted';
import { createHmac, timingSafeEqual } from 'node:crypto';

import { SessionLedger } from './ledger.ts';

// Seven days matches the cookie lifetime, so the token and the browser expire together.
const week = 7 * 24 * 60 * 60 * 1000;

// HMACs a value so a direct string compare never sees the raw session secret.
const digest = (secret: string, value: string): Buffer =>
	createHmac('sha256', secret).update(value).digest();

// Compares secrets in constant time so login timing does not leak the password.
export const sameSecret = (secret: string, left: string, right: string): boolean =>
	timingSafeEqual(digest(secret, left), digest(secret, right));

// Issues an expiring token. The nonce is recorded by the session ledger so logout can revoke it.
export const issueSession = (secret: string, expiresAt: number, nonce: string): string => {
	const body = `${expiresAt}.${nonce}`;
	const signature = createHmac('sha256', secret).update(body).digest('base64url');
	return `${body}.${signature}`;
};

export interface SessionClaims {
	readonly expiresAt: number;
	readonly nonce: string;
}

// Accepts a cookie only when the signature matches and the embedded expiry is still ahead.
export const sessionClaims = (
	secret: string,
	token: string,
	now: number,
): SessionClaims | undefined => {
	const [expiresText, nonce, signature, extra] = token.split('.');
	if (
		expiresText === undefined ||
		nonce === undefined ||
		signature === undefined ||
		extra !== undefined ||
		nonce === ''
	) {
		return undefined;
	}
	const body = `${expiresText}.${nonce}`;
	const expected = createHmac('sha256', secret).update(body).digest('base64url');
	const actual = Buffer.from(signature);
	const wanted = Buffer.from(expected);
	if (actual.length !== wanted.length || !timingSafeEqual(actual, wanted)) {
		return undefined;
	}
	const expiresAt = Number(expiresText);
	if (!Number.isFinite(expiresAt) || expiresAt <= now) {
		return undefined;
	}
	return { expiresAt, nonce };
};

export const sessionLifetime = week;

// Builds the session cookie flags, including a zero max-age when logout must clear it.
export const cookieOptions = (secure: boolean, clear: boolean) => ({
	httpOnly: true,
	maxAge: clear ? 0 : week,
	path: '/',
	sameSite: 'lax' as const,
	secure,
});

// Checks the session cookie and provides the current account to protected routes.
export const SessionLive = Layer.effect(
	Session,
	Effect.gen(function* () {
		const ledger = yield* SessionLedger;
		return Session.of({
			// Turns a valid session cookie into the current account before a protected handler runs.
			session: Effect.fn('Session.session')(function* (httpEffect, { credential }) {
				const now = DateTime.toEpochMillis(yield* DateTime.now);
				const accepted = yield* ledger.accept(Redacted.value(credential), now);
				if (!accepted) {
					return yield* new Unauthorized({ message: 'Log in first' });
				}
				return yield* Effect.provideService(httpEffect, CurrentAccount, new Account({}));
			}),
		});
	}),
);
