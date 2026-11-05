import { StorageError, uploadChunkBytes } from '@private-drive/domain';
import * as DateTime from 'effect/DateTime';
import * as Effect from 'effect/Effect';
import * as Headers from 'effect/http/Headers';
import * as HttpRouter from 'effect/http/HttpRouter';
import * as HttpServerRequest from 'effect/http/HttpServerRequest';
import * as HttpServerResponse from 'effect/http/HttpServerResponse';
import * as Option from 'effect/Option';

import { SessionLedger } from '../auth/ledger.ts';
import { Uploads } from '../drive/uploads.ts';

const rangePattern = /^bytes (\d+)-(\d+)\/(\d+)$/;

// Writes one slice of a resumable upload. The client sends the next byte the server asked for.
const appendChunk = Effect.fn('appendChunk')(function* () {
	const request = yield* HttpServerRequest.HttpServerRequest;
	const ledger = yield* SessionLedger;
	const uploads = yield* Uploads;
	const params = yield* HttpRouter.params;
	const now = DateTime.toEpochMillis(yield* DateTime.now);
	const accepted = yield* ledger.accept(request.cookies['session'] ?? '', now);
	if (!accepted) {
		return HttpServerResponse.text('Log in first', { status: 401 });
	}
	const id = params['id'];
	if (id === undefined) {
		return HttpServerResponse.text('Upload not found', { status: 404 });
	}
	const header = Option.getOrUndefined(Headers.get(request.headers, 'content-range')) ?? '';
	const match = rangePattern.exec(header);
	if (match === null) {
		return HttpServerResponse.text('Content-Range is required', { status: 400 });
	}
	const start = Number(match[1]);
	const end = Number(match[2]);
	const buffer = yield* request.arrayBuffer.pipe(Effect.catch(() => Effect.succeed(undefined)));
	if (buffer === undefined) {
		return HttpServerResponse.text('Could not read the upload chunk', { status: 400 });
	}
	const bytes = new Uint8Array(buffer);
	if (bytes.byteLength > uploadChunkBytes || end - start + 1 !== bytes.byteLength) {
		return HttpServerResponse.text('Upload chunk does not match Content-Range', { status: 400 });
	}
	const written = yield* uploads
		.append(id, start, bytes)
		.pipe(Effect.catchTag('StorageError', (error) => Effect.succeed(error)));
	if (written instanceof StorageError) {
		const resumed = /^Resume this upload at byte (\d+)$/.exec(written.message);
		if (resumed !== null) {
			return HttpServerResponse.jsonUnsafe({ offset: Number(resumed[1]) }, { status: 409 });
		}
		return HttpServerResponse.text(written.message, { status: 400 });
	}
	return HttpServerResponse.jsonUnsafe({ offset: written.offset });
});

export const UploadChunkRoute = HttpRouter.add('PUT', '/api/uploads/sessions/:id', appendChunk());
