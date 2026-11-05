import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';

import { StateStore } from '../state/store.ts';

const auditKey = 'audit';

// Appends one line per change so a later read can see who did what without a database.
export class AuditLog extends Context.Service<
	AuditLog,
	{
		readonly record: (action: string, detail: string) => Effect.Effect<void>;
	}
>()('private-drive/AuditLog') {
	static readonly layer = Layer.effect(
		AuditLog,
		Effect.gen(function* () {
			const store = yield* StateStore;

			return AuditLog.of({
				record: (action, detail) =>
					Effect.gen(function* () {
						const line = JSON.stringify({
							action,
							at: new Date().toISOString(),
							detail: detail.replaceAll(/[\r\n]/g, ' ').slice(0, 300),
						});
						yield* store
							.appendDoc(auditKey, line)
							.pipe(Effect.catch((error) => Effect.logWarning(error.message)));
					}),
			});
		}),
	);
}
