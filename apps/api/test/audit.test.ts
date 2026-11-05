import * as NodeFileSystem from '@effect/platform-node/NodeFileSystem';
import * as NodePath from '@effect/platform-node/NodePath';
import * as Vitest from '@effect/vitest';
import * as Effect from 'effect/Effect';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { AuditLog } from '../src/audit/log.ts';
import { configFor, tempDirectory } from './support.ts';

Vitest.describe('AuditLog', () => {
	// Newlines cannot break the JSONL record, and a very long detail is cut off.
	Vitest.it.effect('appends one JSON line with a flattened detail', () =>
		Effect.gen(function* () {
			const directory = yield* tempDirectory;
			const audit = yield* Effect.gen(function* () {
				return yield* AuditLog;
			}).pipe(
				Effect.provide(AuditLog.layer),
				Effect.provide(NodeFileSystem.layer),
				Effect.provide(NodePath.layer),
				Effect.provide(configFor(directory)),
			);
			yield* audit.record('rename', 'a\nb' + 'x'.repeat(400));
			const text = yield* Effect.tryPromise({
				try: () => readFile(join(directory, 'audit.jsonl'), 'utf8'),
				catch: () => new Error('Could not read the audit log'),
			});
			const [line] = text.trim().split('\n');
			const parsed: unknown = JSON.parse(line ?? '');
			Vitest.expect(parsed).toMatchObject({ action: 'rename' });
			if (
				typeof parsed === 'object' &&
				parsed !== null &&
				'detail' in parsed &&
				typeof parsed.detail === 'string'
			) {
				Vitest.expect(parsed.detail.startsWith('a b')).toBe(true);
				Vitest.expect(parsed.detail.includes('\n')).toBe(false);
				Vitest.expect(parsed.detail.length).toBe(300);
			} else {
				Vitest.expect(parsed).toEqual({ detail: 'missing' });
			}
		}),
	);
});
