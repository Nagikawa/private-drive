import { type SourceId } from '@private-drive/model';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

// A token was not the base64url form of a source and a storage key.
class BadFileId extends Schema.TaggedError<BadFileId>()('BadFileId', {
	message: Schema.String,
}) {}

const sources = new Set<string>(['huggingface', 'r2', 'telegram']);

const encode = Effect.fnUntraced(function* (value: string) {
	const bytes = new TextEncoder().encode(value);
	let binary = '';
	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}
	return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
});

const decode = Effect.fnUntraced(function* (value: string) {
	return yield* Effect.try({
		try: () => {
			const padded = value.replaceAll('-', '+').replaceAll('_', '/');
			const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
			const binary = atob(`${padded}${pad}`);
			const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
			const text = new TextDecoder().decode(bytes);
			return text === '' ? undefined : text;
		},
		catch: () => new BadFileId({ message: 'Invalid file id' }),
	}).pipe(Effect.catch(() => Effect.succeed(undefined)));
});

// One path segment for a stored object. The catalog no longer assigns its own id.
export const fileId = Effect.fnUntraced(function* (source: SourceId, key: string) {
	return yield* encode(`${source}\n${key}`);
});

// Reads the source and storage key back out of a content URL. An unreadable token is absent.
export const readFileId = Effect.fnUntraced(function* (id: string) {
	const text = yield* decode(id);
	if (text === undefined) {
		return undefined;
	}
	const split = text.indexOf('\n');
	if (split <= 0) {
		return undefined;
	}
	const source = text.slice(0, split);
	const key = text.slice(split + 1);
	if (!sources.has(source) || key === '') {
		return undefined;
	}
	return { key, source: source as SourceId };
});
