import { InvalidJson, PendingUpload, StoredUpload, type SessionBook } from '@private-drive/model';
import * as Effect from 'effect/Effect';
import * as Predicate from 'effect/Predicate';
import * as Schema from 'effect/Schema';

const SessionsFile = Schema.Struct({
	sessions: Schema.Record(Schema.String, Schema.Unknown),
});

const parsedJson = Effect.fnUntraced(function* (text: string) {
	if (text === '') {
		return undefined;
	}
	return yield* Effect.try({
		try: () => JSON.parse(text) as unknown,
		catch: () => new InvalidJson({ message: 'The response format is invalid' }),
	}).pipe(Effect.catch(() => Effect.succeed(undefined)));
});

// Keeps only journal rows that still describe an upload. A corrupt file starts over.
export const storedUploads = Effect.fnUntraced(function* (text: string) {
	const parsed = yield* parsedJson(text);
	if (!Array.isArray(parsed)) {
		return [] as Array<StoredUpload>;
	}
	const rows: Array<StoredUpload> = [];
	for (const item of parsed) {
		const decoded = yield* Schema.decodeUnknownEffect(StoredUpload)(item).pipe(Effect.result);
		if (decoded._tag === 'Success') {
			rows.push(decoded.success);
		}
	}
	return rows;
});

// Keeps multipart uploads that still have a key and an id. A corrupt journal is empty.
export const pendingUploads = Effect.fnUntraced(function* (text: string) {
	const parsed = yield* parsedJson(text);
	if (!Array.isArray(parsed)) {
		return [] as Array<PendingUpload>;
	}
	const rows: Array<PendingUpload> = [];
	for (const item of parsed) {
		const decoded = yield* Schema.decodeUnknownEffect(PendingUpload)(item).pipe(Effect.result);
		if (
			decoded._tag === 'Success' &&
			decoded.success.key !== '' &&
			decoded.success.uploadId !== ''
		) {
			rows.push(decoded.success);
		}
	}
	return rows;
});

// Reads the nonce book. A missing or damaged file means no sessions are remembered.
export const sessionBook = Effect.fnUntraced(function* (text: string) {
	const parsed = yield* parsedJson(text);
	const decoded = yield* Schema.decodeUnknownEffect(SessionsFile)(parsed).pipe(Effect.result);
	if (decoded._tag === 'Failure') {
		return {} as SessionBook;
	}
	const book: SessionBook = {};
	for (const [nonce, expiresAt] of Object.entries(decoded.success.sessions)) {
		if (Predicate.isNumber(expiresAt) && Number.isFinite(expiresAt)) {
			book[nonce] = expiresAt;
		}
	}
	return book;
});

// Drops nonces whose cookies have already expired.
export const activeSessions = Effect.fnUntraced(function* (book: SessionBook, now: number) {
	const next: SessionBook = {};
	for (const [nonce, expiresAt] of Object.entries(book)) {
		if (expiresAt > now) {
			next[nonce] = expiresAt;
		}
	}
	return next;
});
