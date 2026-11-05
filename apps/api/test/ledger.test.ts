import * as NodeFileSystem from '@effect/platform-node/NodeFileSystem';
import * as NodePath from '@effect/platform-node/NodePath';
import * as Vitest from '@effect/vitest';
import * as Effect from 'effect/Effect';

import { SessionLedger } from '../src/auth/ledger.ts';
import { configFor, tempDirectory } from './support.ts';

const ledgerIn = (directory: string) =>
	Effect.gen(function* () {
		return yield* SessionLedger;
	}).pipe(
		Effect.provide(SessionLedger.layer),
		Effect.provide(NodeFileSystem.layer),
		Effect.provide(NodePath.layer),
		Effect.provide(configFor(directory)),
	);

Vitest.describe('SessionLedger', () => {
	// Logout removes the nonce, so a copied cookie stops working before the week is over.
	Vitest.it.effect('issues a cookie, then rejects it after revoke', () =>
		Effect.gen(function* () {
			const directory = yield* tempDirectory;
			const ledger = yield* ledgerIn(directory);
			const now = 1_000;
			const token = yield* ledger.issue(now);
			Vitest.expect(yield* ledger.accept(token, now)).toBe(true);
			yield* ledger.revoke(token, now);
			Vitest.expect(yield* ledger.accept(token, now)).toBe(false);
			Vitest.expect(yield* ledger.accept('not-a-cookie', now)).toBe(false);
		}),
	);
});
