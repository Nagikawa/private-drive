import {
	Account,
	Api,
	CurrentAccount,
	LoginPayload,
	SessionCookie,
	Unauthorized,
} from '@private-drive/domain';
import * as DateTime from 'effect/DateTime';
import * as Effect from 'effect/Effect';
import * as HttpApiBuilder from 'effect/http-api/HttpApiBuilder';
import * as HttpServerRequest from 'effect/http/HttpServerRequest';
import * as Redacted from 'effect/Redacted';

import { AuditLog } from '../audit/log.ts';
import { AppConfig } from '../config.ts';
import { SessionLedger } from './ledger.ts';
import { cookieOptions, sameSecret } from './session.ts';

// Checks the posted password and sets the session cookie the browser will send on later calls.
const login = Effect.fn('Session.login')(function* (
	config: AppConfig['Service'],
	ledger: SessionLedger['Service'],
	audit: AuditLog['Service'],
	payload: LoginPayload,
) {
	const secret = Redacted.value(config.sessionSecret);
	const passwordOk = sameSecret(secret, payload.password, Redacted.value(config.authPassword));
	if (!passwordOk) {
		yield* audit.record('login-failed', '');
		return yield* new Unauthorized({ message: 'Incorrect password' });
	}
	const now = DateTime.toEpochMillis(yield* DateTime.now);
	const token = yield* ledger.issue(now);
	yield* HttpApiBuilder.securitySetCookie(
		SessionCookie,
		token,
		cookieOptions(config.cookieSecure, false),
	);
	yield* audit.record('login', '');
	return new Account({});
});

export const SessionHandlers = HttpApiBuilder.group(
	Api,
	'session',
	Effect.fn('SessionHandlers')(function* (handlers) {
		const config = yield* AppConfig;
		const ledger = yield* SessionLedger;
		const audit = yield* AuditLog;
		return handlers.handleAll({
			// Returns the account already attached by session middleware.
			current: () => CurrentAccount,
			// Exchanges a password for a session cookie.
			login: ({ payload }) => login(config, ledger, audit, payload),
			// Revokes the nonce and clears the cookie, so a copied cookie stops working.
			logout: () =>
				Effect.gen(function* () {
					const request = yield* HttpServerRequest.HttpServerRequest;
					const now = DateTime.toEpochMillis(yield* DateTime.now);
					yield* ledger.revoke(request.cookies['session'] ?? '', now);
					yield* audit.record('logout', '');
					yield* HttpApiBuilder.securitySetCookie(
						SessionCookie,
						'',
						cookieOptions(config.cookieSecure, true),
					);
				}),
		});
	}),
);
