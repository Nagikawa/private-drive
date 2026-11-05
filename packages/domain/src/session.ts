import { Account, Unauthorized } from '@private-drive/model';
import * as Context from 'effect/Context';
import * as HttpApiMiddleware from 'effect/http-api/HttpApiMiddleware';
import * as HttpApiSecurity from 'effect/http-api/HttpApiSecurity';

// The account a valid session cookie provides to a protected route.
export class CurrentAccount extends Context.Service<CurrentAccount, Account>()(
	'private-drive/CurrentAccount',
) {}

export const SessionCookie = HttpApiSecurity.apiKey({
	in: 'cookie',
	key: 'session',
});

export class Session extends HttpApiMiddleware.Service<
	Session,
	{
		provides: CurrentAccount;
	}
>()('private-drive/Session', {
	error: Unauthorized,
	requiredForClient: false,
	security: {
		session: SessionCookie,
	},
}) {}
