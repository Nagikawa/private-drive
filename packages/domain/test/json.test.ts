import * as Vitest from '@effect/vitest';
import * as Effect from 'effect/Effect';

import { failureMessage, parseJson } from '../src/utils/json.ts';

Vitest.describe('parseJson', () => {
	// An empty body is not a payload.
	Vitest.it.effect('returns undefined for an empty body', () =>
		Effect.gen(function* () {
			Vitest.expect(yield* parseJson('')).toBeUndefined();
		}),
	);

	// Valid JSON becomes a value the caller can read.
	Vitest.it.effect('parses an object', () =>
		Effect.gen(function* () {
			Vitest.expect(yield* parseJson('{"message":"nope"}')).toEqual({ message: 'nope' });
		}),
	);

	// Invalid JSON is a tagged error, not a thrown SyntaxError.
	Vitest.it.effect('fails when the text is not JSON', () =>
		Effect.gen(function* () {
			const message = yield* parseJson('{').pipe(
				Effect.match({
					onFailure: (error) => error.message,
					onSuccess: () => '',
				}),
			);
			Vitest.expect(message).toBe('The response format is invalid');
		}),
	);
});

Vitest.describe('failureMessage', () => {
	// A string message field is what the notice should show.
	Vitest.it.effect('reads a message field', () =>
		Effect.gen(function* () {
			Vitest.expect(
				yield* failureMessage({ message: 'Folder is not empty' }, 'Request failed'),
			).toBe('Folder is not empty');
		}),
	);

	// Anything else keeps the caller's fallback.
	Vitest.it.effect('uses the fallback when the body has no message', () =>
		Effect.gen(function* () {
			Vitest.expect(yield* failureMessage({ ok: false }, 'Request failed')).toBe('Request failed');
		}),
	);
});
