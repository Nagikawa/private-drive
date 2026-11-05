import { Api, StorageError, contentTypeFromName, type SourceId } from '@private-drive/domain';
import * as ByteSize from 'effect/ByteSize';
import * as Effect from 'effect/Effect';
import * as FileSystem from 'effect/FileSystem';
import * as HttpApiBuilder from 'effect/http-api/HttpApiBuilder';
import * as Option from 'effect/Option';

import { Drive } from '../drive/drive.ts';
import { Uploads } from '../drive/uploads.ts';

interface UploadBody {
	readonly file: { readonly contentType: string; readonly name: string; readonly path: string };
	readonly folder: string;
	readonly source: SourceId;
}

export const FilesHandlers = HttpApiBuilder.group(
	Api,
	'files',
	Effect.fn('FilesHandlers')(function* (handlers) {
		const drive = yield* Drive;
		const uploads = yield* Uploads;
		const fs = yield* FileSystem.FileSystem;

		// Stats the temporary multipart file and passes its path through, so a large body is streamed from disk.
		const upload = Effect.fn('FilesHandlers.upload')(function* (payload: UploadBody) {
			const info = yield* fs
				.stat(payload.file.path)
				.pipe(
					Effect.mapError(
						() => new StorageError({ message: 'Could not read the uploaded temporary file' }),
					),
				);
			const size = yield* Option.match(ByteSize.toNumber(info.size), {
				onNone: () => Effect.fail(new StorageError({ message: 'The uploaded file is too large' })),
				onSome: Effect.succeed,
			});
			const contentType =
				payload.file.contentType === '' || payload.file.contentType === 'application/octet-stream'
					? yield* contentTypeFromName(payload.file.name)
					: payload.file.contentType;
			return yield* drive.upload({
				contentType,
				folder: payload.folder,
				name: payload.file.name,
				path: payload.file.path,
				size,
				source: payload.source,
			});
		});

		return handlers.handleAll({
			// Creates a folder on the source the client selected.
			createFolder: ({ payload }) => drive.createFolder(payload.source, payload.path),
			// Deletes an empty folder and answers 404 when the source has no such prefix.
			deleteFolder: ({ payload }) => drive.deleteFolder(payload.source, payload.path),
			// Lists one folder, optionally searching or walking the whole tree for the sidebar.
			list: ({ query }) =>
				drive.list({
					...(query.cursor === undefined || query.cursor === '' ? {} : { cursor: query.cursor }),
					folder: query.folder ?? '',
					kind: query.kind ?? 'all',
					order: query.order ?? 'asc',
					recursive: query.recursive === 'true',
					search: query.search ?? '',
					sort: query.sort ?? 'name',
					source: query.source,
				}),
			// Moves the selected ids into another folder on the same source.
			move: ({ payload }) => drive.move(payload.ids, payload.folder),
			// Renames one file and keeps the stored extension even if the request names another type.
			rename: ({ payload }) => drive.rename(payload.id, payload.name),
			// Signs a short-lived content URL for one stored object.
			share: ({ payload }) => drive.share(payload.id),
			// Starts a resumable upload, or returns the one already stored for this file.
			openUpload: ({ payload }) => uploads.open(payload),
			// Lists uploads in this folder that have not been finished.
			uploadSessions: ({ query }) => uploads.list(query.source, query.folder ?? ''),
			// Moves a finished temporary file into the drive.
			completeUpload: ({ payload }) => uploads.complete(payload.id),
			// Deletes the selected objects from their stores.
			remove: ({ payload }) => drive.remove(payload.ids),
			// Reports which storage providers are configured and reachable.
			sources: () => drive.sources(),
			upload: ({ payload }) => upload(payload),
			// Stores a file fetched from a public URL.
			uploadUrl: ({ payload }) => drive.uploadUrl(payload.source, payload.folder, payload.url),
		});
	}),
);
