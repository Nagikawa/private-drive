import { Service } from '@angular/core';
import {
	DeletePayload,
	DeleteResult,
	FileEntry,
	FolderEntry,
	FolderPayload,
	CompleteUpload,
	Listing,
	OpenUpload,
	LoginPayload,
	MovePayload,
	MoveResult,
	RenamePayload,
	ShareLink,
	SharePayload,
	NotFound,
	SourceStatus,
	StorageError,
	Unauthorized,
	UploadProgress,
	UrlUploadPayload,
	contentPath,
	failureMessage,
	parseJson,
	pure,
	type Account,
	type SourceId,
} from '@private-drive/domain';
import * as Effect from 'effect/Effect';
import * as HttpClient from 'effect/http/HttpClient';
import * as HttpClientError from 'effect/http/HttpClientError';
import * as Predicate from 'effect/Predicate';

import { InvalidResponse, NetworkFailure, type DriveFailure } from '../../core/drive-error';
import { ApiClient, type DriveServices } from '../drive-runtime/drive-runtime.service';

// Turns a client or API failure into a tagged error the screens can catch.
const toDriveFailure = (cause: unknown): DriveFailure => {
	if (
		cause instanceof Unauthorized ||
		cause instanceof StorageError ||
		cause instanceof NotFound ||
		cause instanceof NetworkFailure ||
		cause instanceof InvalidResponse
	) {
		return cause;
	}
	if (HttpClientError.isHttpClientError(cause)) {
		if (cause.reason._tag === 'TransportError') {
			return new NetworkFailure({ message: 'Could not connect' });
		}
		const message = cause.message === '' ? 'Request failed' : cause.message;
		if (cause.reason._tag === 'DecodeError' || cause.reason._tag === 'EmptyBodyError') {
			return new InvalidResponse({ message });
		}
		return new NetworkFailure({ message });
	}
	if (
		Predicate.isObject(cause) &&
		Predicate.hasProperty(cause, 'message') &&
		Predicate.isString(cause.message) &&
		cause.message !== ''
	) {
		return new NetworkFailure({ message: cause.message });
	}
	return new NetworkFailure({ message: 'Request failed' });
};

// Looks up the typed client and maps every failure onto a drive error.
const call = <A>(use: (client: ApiClient['Service']) => Effect.Effect<A, unknown>) =>
	Effect.gen(function* () {
		const client = yield* ApiClient;
		return yield* use(client);
	}).pipe(Effect.mapError(toDriveFailure));

@Service()
export class DriveApi {
	// Exchanges the password for a session cookie through the typed client.
	login(password: string): Effect.Effect<Account, DriveFailure, DriveServices> {
		return call((client) => client.session.login({ payload: LoginPayload.make({ password }) }));
	}

	// Loads the signed-in account so route guards know whether the cookie is still valid.
	current(): Effect.Effect<Account, DriveFailure, DriveServices> {
		return call((client) => client.session.current());
	}

	// Clears the session cookie before the shell sends the user back to login.
	logout(): Effect.Effect<void, DriveFailure, DriveServices> {
		return call((client) => client.session.logout());
	}

	// Asks which storage providers are connected so the shell can hide the rest.
	sources(): Effect.Effect<ReadonlyArray<SourceStatus>, DriveFailure, DriveServices> {
		return call((client) => client.files.sources());
	}

	// Lists one folder, including the recursive call the sidebar uses to build the tree.
	list(query: {
		source: SourceId;
		folder?: string;
		search?: string;
		kind: 'all' | 'image';
		recursive: 'true' | 'false';
		cursor?: string;
		sort?: 'name' | 'size' | 'created' | 'type';
		order?: 'asc' | 'desc';
	}): Effect.Effect<Listing, DriveFailure, DriveServices> {
		return call((client) => client.files.list({ query }));
	}

	// Creates a folder on the active source.
	createFolder(
		source: SourceId,
		path: string,
	): Effect.Effect<FolderEntry, DriveFailure, DriveServices> {
		return call((client) =>
			client.files.createFolder({ payload: FolderPayload.make({ source, path }) }),
		);
	}

	// Deletes an empty folder on the active source.
	deleteFolder(source: SourceId, path: string): Effect.Effect<void, DriveFailure, DriveServices> {
		return call((client) =>
			client.files.deleteFolder({ payload: FolderPayload.make({ source, path }) }),
		);
	}

	// Deletes the selected file ids.
	remove(ids: ReadonlyArray<string>): Effect.Effect<DeleteResult, DriveFailure, DriveServices> {
		return call((client) => client.files.remove({ payload: DeletePayload.make({ ids }) }));
	}

	// Moves the selected files into another folder.
	move(
		ids: ReadonlyArray<string>,
		folder: string,
	): Effect.Effect<MoveResult, DriveFailure, DriveServices> {
		return call((client) => client.files.move({ payload: MovePayload.make({ folder, ids }) }));
	}

	// Renames one file. The server keeps the stored extension.
	rename(id: string, name: string): Effect.Effect<FileEntry, DriveFailure, DriveServices> {
		return call((client) => client.files.rename({ payload: RenamePayload.make({ id, name }) }));
	}

	// Asks for a one-hour content URL that works without the session cookie.
	share(id: string): Effect.Effect<ShareLink, DriveFailure, DriveServices> {
		return call((client) => client.files.share({ payload: SharePayload.make({ id }) }));
	}

	// Stores a file fetched from a public URL.
	uploadUrl(
		source: SourceId,
		folder: string,
		url: string,
	): Effect.Effect<FileEntry, DriveFailure, DriveServices> {
		return call((client) =>
			client.files.uploadUrl({ payload: UrlUploadPayload.make({ source, folder, url }) }),
		);
	}

	// Opens a resumable upload, returning one that already has some bytes when the file matches.
	openUpload(input: {
		contentType: string;
		folder: string;
		name: string;
		size: number;
		source: SourceId;
	}): Effect.Effect<UploadProgress, DriveFailure, DriveServices> {
		return call((client) => client.files.openUpload({ payload: OpenUpload.make(input) }));
	}

	// Lists unfinished uploads in one folder.
	uploadSessions(
		source: SourceId,
		folder: string,
	): Effect.Effect<ReadonlyArray<UploadProgress>, DriveFailure, DriveServices> {
		return call((client) => client.files.uploadSessions({ query: { source, folder } }));
	}

	// Writes one slice. A 409 returns the offset the server already has.
	sendChunk(
		id: string,
		start: number,
		end: number,
		total: number,
		bytes: Uint8Array,
	): Effect.Effect<number, DriveFailure> {
		return Effect.tryPromise({
			try: async () => {
				const copy = new ArrayBuffer(bytes.byteLength);
				new Uint8Array(copy).set(bytes);
				const response = await fetch(`/api/uploads/sessions/${encodeURIComponent(id)}`, {
					body: copy,
					credentials: 'include',
					headers: { 'content-range': `bytes ${start}-${end}/${total}` },
					method: 'PUT',
				});
				const text = await response.text();
				const parsed: unknown = text === '' ? {} : JSON.parse(text);
				const offset =
					typeof parsed === 'object' &&
					parsed !== null &&
					'offset' in parsed &&
					typeof parsed.offset === 'number'
						? parsed.offset
						: undefined;
				if (response.status === 409 && offset !== undefined) {
					return offset;
				}
				if (!response.ok || offset === undefined) {
					throw new Error('Upload chunk failed');
				}
				return offset;
			},
			catch: () => new NetworkFailure({ message: 'Could not upload the next part' }),
		});
	}

	// Stores a finished resumable upload.
	completeUpload(id: string): Effect.Effect<FileEntry, DriveFailure, DriveServices> {
		return call((client) => client.files.completeUpload({ payload: CompleteUpload.make({ id }) }));
	}

	// Posts the browser file as multipart through the same typed client as the JSON routes.
	upload(
		file: File,
		source: SourceId,
		folder: string,
	): Effect.Effect<FileEntry, DriveFailure, DriveServices> {
		const body = new FormData();
		body.set('source', source);
		body.set('folder', folder);
		body.set('file', file);
		return call((client) => client.files.upload({ payload: body }));
	}

	// Reads preview text from the raw content route, using the shared fetch client so the session cookie is included.
	text(id: string): Effect.Effect<string, DriveFailure, HttpClient.HttpClient> {
		return Effect.gen(function* () {
			const response = yield* HttpClient.get(`/api/files/${encodeURIComponent(id)}/content`).pipe(
				Effect.mapError(() => new NetworkFailure({ message: 'Could not connect' })),
			);
			const text = yield* response.text.pipe(
				Effect.mapError(() => new InvalidResponse({ message: 'Could not read the response' })),
			);
			if (response.status < 200 || response.status >= 300) {
				const parsed = yield* parseJson(text).pipe(
					Effect.mapError(() => new InvalidResponse({ message: 'The response format is invalid' })),
				);
				const message = yield* failureMessage(parsed, 'Could not read the content');
				return yield* new InvalidResponse({ message });
			}
			return text;
		});
	}

	// Builds the content URL the browser loads directly for images, audio, and video.
	contentUrl(id: string): string {
		return pure(contentPath(id), `/api/files/${encodeURIComponent(id)}/content`);
	}
}
