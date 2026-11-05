import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as FileSystem from 'effect/FileSystem';
import * as Layer from 'effect/Layer';
import * as Path from 'effect/Path';
import { appendFile } from 'node:fs/promises';

import { AppConfig } from '../config.ts';

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
			const config = yield* AppConfig;
			const fs = yield* FileSystem.FileSystem;
			const path = yield* Path.Path;
			const bookPath = path.join(config.dataDir, 'audit.jsonl');

			return AuditLog.of({
				record: (action, detail) =>
					Effect.gen(function* () {
						const line = JSON.stringify({
							action,
							at: new Date().toISOString(),
							detail: detail.replaceAll(/[\r\n]/g, ' ').slice(0, 300),
						});
						yield* fs
							.makeDirectory(path.dirname(bookPath), { recursive: true })
							.pipe(Effect.catch(() => Effect.void));
						yield* Effect.tryPromise({
							catch: () => 'Could not append the audit log',
							try: () => appendFile(bookPath, `${line}\n`, 'utf8'),
						}).pipe(Effect.catch((message) => Effect.logWarning(message)));
					}),
			});
		}),
	);
}
