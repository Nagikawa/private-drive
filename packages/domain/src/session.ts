import * as HttpApiMiddleware from 'effect/http-api/HttpApiMiddleware';
import * as HttpApiSecurity from 'effect/http-api/HttpApiSecurity';

import { CurrentAccount, Unauthorized } from './model.ts';

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
