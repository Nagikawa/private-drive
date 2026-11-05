import {
	DeleteResult,
	FileEntry,
	FolderEntry,
	Listing,
	MoveResult,
	NotFound,
	ShareLink,
	SourceStatus,
	StorageError,
	keepName,
	type SourceId,
} from '@private-drive/model';
import {
	connectedResource,
	nameKeepingType,
	normalizeFolder,
	sanitizeFileName,
	telegramChatUrl,
} from '@private-drive/policy';
import {
	contentTypeFromName,
	fileId,
	folderName,
	isDirectChildFolder,
	isImageContent,
	isWithinFolder,
	namesInFolder,
	pageFiles,
	pure,
	readFileId,
	splitStorageKey,
	storageKey,
	unavailable,
	uniqueName,
} from '@private-drive/utils';
import * as Context from 'effect/Context';
import * as DateTime from 'effect/DateTime';
import * as Effect from 'effect/Effect';
import * as FileSystem from 'effect/FileSystem';
import * as Layer from 'effect/Layer';
import * as Redacted from 'effect/Redacted';
import * as Stream from 'effect/Stream';

import type { FileStore } from '../storage/file-store.ts';

import { AuditLog } from '../audit/log.ts';
import { shareLifetime, signContent } from '../auth/share.ts';
import { AppConfig } from '../config.ts';
import { Stores } from '../storage/stores.ts';
import { downloadPublic } from './download.ts';

// Rejects a folder string that could escape the drive root before any provider is called.
const requireFolder = Effect.fn('Drive.requireFolder')(function* (input: string) {
	return yield* normalizeFolder(input).pipe(
		Effect.mapError(() => new StorageError({ message: 'Invalid folder path' })),
	);
});

// Array callbacks cannot yield, so an infallible key split is read here.
const partsOf = (key: string) => pure(splitStorageKey(key), { folder: '', name: key });

// Turns a provider probe into a source card, including the unconfigured case the UI hides.
const sourceStatus = Effect.fn('Drive.sourceStatus')(function* (
	store: FileStore,
	url: string | undefined,
) {
	const address = url === undefined ? {} : { url };
	if (!store.configured) {
		return new SourceStatus({
			connected: false,
			detail: 'Not configured',
			id: store.id,
			label: store.label,
			...address,
		});
	}
	const detail = yield* store.status().pipe(Effect.catch((error) => Effect.succeed(error.message)));
	// A missing resource name is a tagged failure. The source stays disconnected and nothing is thrown.
	const resource = yield* connectedResource(detail).pipe(
		Effect.catchTag('ResourceNameError', () => Effect.succeed(undefined)),
	);
	return new SourceStatus({
		connected: resource !== undefined,
		detail,
		id: store.id,
		label: store.label,
		...address,
	});
});

export class Drive extends Context.Service<
	Drive,
	{
		createFolder(source: SourceId, path: string): Effect.Effect<FolderEntry, StorageError>;
		deleteFolder(source: SourceId, path: string): Effect.Effect<void, NotFound | StorageError>;
		list(input: {
			readonly cursor?: string;
			readonly folder: string;
			readonly kind: 'all' | 'image';
			readonly order: 'asc' | 'desc';
			readonly recursive: boolean;
			readonly search: string;
			readonly sort: 'name' | 'size' | 'created' | 'type';
			readonly source: SourceId;
		}): Effect.Effect<Listing, StorageError>;
		read(id: string): Effect.Effect<
			{
				readonly body: Stream.Stream<Uint8Array, StorageError>;
				readonly contentType: string;
				readonly name: string;
				readonly size: number;
			},
			NotFound | StorageError
		>;
		remove(ids: ReadonlyArray<string>): Effect.Effect<DeleteResult, StorageError>;
		move(ids: ReadonlyArray<string>, folder: string): Effect.Effect<MoveResult, StorageError>;
		rename(id: string, name: string): Effect.Effect<FileEntry, StorageError>;
		share(id: string): Effect.Effect<ShareLink, NotFound | StorageError>;
		sources(): Effect.Effect<ReadonlyArray<SourceStatus>>;
		upload(input: {
			readonly contentType: string;
			readonly folder: string;
			readonly name: string;
			readonly path: string;
			readonly size: number;
			readonly source: SourceId;
		}): Effect.Effect<FileEntry, StorageError>;
		uploadUrl(
			source: SourceId,
			folder: string,
			url: string,
		): Effect.Effect<FileEntry, StorageError>;
	}
>()('private-drive/Drive') {
	// Wires the store registry into the operations the HTTP routes call.
	static readonly layer = Layer.effect(
		Drive,
		Effect.gen(function* () {
			const audit = yield* AuditLog;
			const config = yield* AppConfig;
			const secret = Redacted.value(config.sessionSecret);
			const telegramUrl =
				config.telegram === undefined ? undefined : yield* telegramChatUrl(config.telegram.chatId);
			const fs = yield* FileSystem.FileSystem;
			const stores = yield* Stores;

			const toEntry = Effect.fnUntraced(function* (input: {
				readonly contentType: string;
				readonly createdAt: string;
				readonly folder: string;
				readonly key: string;
				readonly name: string;
				readonly size: number;
				readonly source: SourceId;
			}) {
				return new FileEntry({
					contentType: input.contentType,
					createdAt: input.createdAt,
					folder: input.folder,
					id: yield* fileId(input.source, input.key),
					image: yield* isImageContent(input.contentType),
					name: input.name,
					size: input.size,
					source: input.source,
				});
			});

			// Stops a write early when the chosen source has no credentials.
			const ensureStore = Effect.fn('Drive.ensureStore')(function* (source: SourceId) {
				const store = stores.get(source);
				if (!store.configured) {
					return yield* unavailable(source);
				}
				return store;
			});

			// Telegram cannot enumerate objects, so a list-shaped edit has nothing to address.
			const requireListed = Effect.fn('Drive.requireListed')(function* (source: SourceId) {
				const store = yield* ensureStore(source);
				if (!store.listsRemotely) {
					return yield* new StorageError({ message: `${store.label} does not keep a file list` });
				}
				return store;
			});

			// Stores the temp file. The provider's own key is the id the content route opens later.
			const saveUpload = Effect.fn('Drive.saveUpload')(function* (input: {
				readonly contentType: string;
				readonly folder: string;
				readonly name: string;
				readonly path: string;
				readonly size: number;
				readonly source: SourceId;
			}) {
				const store = yield* ensureStore(input.source);
				const folder = yield* requireFolder(input.folder);
				const safeName = yield* sanitizeFileName(input.name).pipe(
					Effect.mapError(() => new StorageError({ message: 'Invalid file name' })),
				);
				const limit = store.byteLimit;
				if (limit !== undefined && input.size > limit) {
					return yield* new StorageError({
						message: `${store.label} file size limit is ${Math.floor(limit / (1024 * 1024))} MB`,
					});
				}
				const remote = store.listsRemotely
					? yield* store.list(folder, false)
					: { files: [], folders: [], truncated: false };
				const name = yield* uniqueName(safeName, yield* namesInFolder(remote, folder));
				const key = yield* storageKey(folder, name);
				const placed = yield* store.putFile(key, input.path, input.size, input.contentType);
				const stamp = DateTime.formatIso(yield* DateTime.now);
				yield* audit.record('upload', `${input.source} ${folder}/${name}`);
				return yield* toEntry({
					contentType: input.contentType,
					createdAt: stamp,
					folder,
					key: placed.storageKey,
					name,
					size: input.size,
					source: input.source,
				});
			});

			// Reads one provider page and pages it for the folder the UI asked for.
			const list = Effect.fn('Drive.list')(function* (input: {
				readonly cursor?: string;
				readonly folder: string;
				readonly kind: 'all' | 'image';
				readonly order: 'asc' | 'desc';
				readonly recursive: boolean;
				readonly search: string;
				readonly sort: 'name' | 'size' | 'created' | 'type';
				readonly source: SourceId;
			}) {
				const store = yield* ensureStore(input.source);
				const folder = yield* requireFolder(input.folder);
				if (!store.listsRemotely) {
					return new Listing({
						files: [],
						folder,
						folders: [],
						source: input.source,
						truncated: false,
					});
				}
				const remote = yield* store.list(folder, input.recursive);
				const query = input.search.trim().toLowerCase();
				const files: Array<FileEntry> = [];
				for (const file of remote.files) {
					const parts = partsOf(file.key);
					if (parts.name === keepName) {
						continue;
					}
					const inFolder = input.recursive
						? pure(isWithinFolder(folder, parts.folder), false)
						: parts.folder === folder;
					if (!inFolder) {
						continue;
					}
					if (input.kind === 'image' && !(yield* isImageContent(file.contentType))) {
						continue;
					}
					if (query !== '' && !parts.name.toLowerCase().includes(query)) {
						continue;
					}
					files.push(
						yield* toEntry({
							contentType: file.contentType,
							createdAt: file.createdAt ?? '',
							folder: parts.folder,
							key: file.key,
							name: parts.name,
							size: Math.trunc(file.size),
							source: input.source,
						}),
					);
				}
				const folders = remote.folders.filter(
					(path) =>
						(input.recursive
							? path !== folder && pure(isWithinFolder(folder, path), false)
							: pure(isDirectChildFolder(folder, path), false)) &&
						(query === '' || pure(folderName(path), path).toLowerCase().includes(query)),
				);
				const page = yield* pageFiles(files, {
					...(input.cursor === undefined ? {} : { cursor: input.cursor }),
					order: input.order,
					sort: input.sort,
				});
				return new Listing({
					files: page.files,
					folder,
					folders: folders
						.sort((left, right) => left.localeCompare(right, 'zh-Hant'))
						.map((path) => new FolderEntry({ name: pure(folderName(path), path), path })),
					...(page.next === undefined ? {} : { next: page.next }),
					source: input.source,
					truncated: remote.truncated,
				});
			});

			return Drive.of({
				// Writes a folder marker. The next list sees it as a prefix, so nothing is stored locally.
				createFolder: Effect.fn('Drive.createFolder')(function* (source, path) {
					const store = yield* requireListed(source);
					const folder = yield* requireFolder(path);
					if (folder === '') {
						return yield* new StorageError({ message: 'Enter a folder name' });
					}
					yield* store.putMarker(folder);
					yield* audit.record('create-folder', `${source} ${folder}`);
					return new FolderEntry({ name: yield* folderName(folder), path: folder });
				}),
				// Removes an empty folder marker. A source that cannot list has no folder to delete.
				deleteFolder: Effect.fn('Drive.deleteFolder')(function* (source, path) {
					const store = yield* requireListed(source);
					const folder = yield* requireFolder(path);
					if (folder === '') {
						return yield* new StorageError({ message: 'Cannot delete Root' });
					}
					const remote = yield* store.list(folder, true);
					const occupied =
						remote.files.some((file) => {
							const parts = partsOf(file.key);
							return parts.name !== keepName && pure(isWithinFolder(folder, parts.folder), false);
						}) ||
						remote.folders.some(
							(item) => item !== folder && pure(isWithinFolder(folder, item), false),
						);
					if (occupied) {
						return yield* new StorageError({ message: 'The folder is not empty' });
					}
					const known =
						remote.folders.includes(folder) ||
						remote.files.some((file) => partsOf(file.key).folder === folder);
					if (!known) {
						return yield* new NotFound({ message: 'Folder not found' });
					}
					yield* store.deleteMarker(folder);
					yield* audit.record('delete-folder', `${source} ${folder}`);
				}),
				list,
				// Opens one file as a byte stream. The id is the source and storage key, not a catalog row.
				read: Effect.fn('Drive.read')(function* (id: string) {
					const parsed = yield* readFileId(id);
					if (parsed === undefined) {
						return yield* new NotFound({ message: 'File not found' });
					}
					const parts = partsOf(parsed.key);
					const body = yield* stores.get(parsed.source).open(parsed.key);
					return {
						body,
						contentType: yield* contentTypeFromName(parts.name),
						name: parts.name,
						size: 0,
					};
				}),
				// Deletes each selected object from its store. A source without a list has no addressable file.
				remove: Effect.fn('Drive.remove')(function* (ids: ReadonlyArray<string>) {
					let removed = 0;
					for (const id of ids) {
						const parsed = yield* readFileId(id);
						if (parsed === undefined) {
							continue;
						}
						const store = yield* requireListed(parsed.source);
						yield* store.remove(parsed.key, undefined);
						removed += 1;
					}
					yield* audit.record('delete', String(removed));
					return new DeleteResult({ removed });
				}),
				// Moves files inside one source by copying the remote object to the new key.
				move: Effect.fn('Drive.move')(function* (ids: ReadonlyArray<string>, folderInput: string) {
					const destination = yield* requireFolder(folderInput);
					if (ids.length === 0) {
						return yield* new StorageError({ message: 'Choose files' });
					}
					const files: Array<{
						readonly key: string;
						readonly name: string;
						readonly source: SourceId;
					}> = [];
					for (const id of ids) {
						const parsed = yield* readFileId(id);
						if (parsed === undefined) {
							return yield* new StorageError({ message: 'File not found' });
						}
						files.push({ key: parsed.key, name: partsOf(parsed.key).name, source: parsed.source });
					}
					const names = new Set<string>();
					for (const file of files) {
						if (names.has(file.name)) {
							return yield* new StorageError({
								message: `Selected files include a duplicate name "${file.name}"`,
							});
						}
						names.add(file.name);
					}
					const pending = files.filter((file) => partsOf(file.key).folder !== destination);
					if (pending.length === 0) {
						return yield* new StorageError({ message: 'The file is already in this folder' });
					}
					const source = pending[0]?.source;
					if (source === undefined || pending.some((file) => file.source !== source)) {
						return yield* new StorageError({ message: 'Choose files from one source' });
					}
					const store = yield* requireListed(source);
					const occupied = yield* namesInFolder(yield* store.list(destination, false), destination);
					for (const file of pending) {
						if (occupied.has(file.name)) {
							return yield* new StorageError({
								message: `"${file.name}" already exists in the destination folder`,
							});
						}
					}
					let moved = 0;
					for (const file of pending) {
						const nextKey = yield* storageKey(destination, file.name);
						yield* store.relocate(file.key, nextKey);
						moved += 1;
					}
					yield* audit.record('move', `${moved} -> ${destination}`);
					return new MoveResult({ moved });
				}),
				// Renames one file while keeping its stored extension and content type.
				rename: Effect.fn('Drive.rename')(function* (id: string, requested: string) {
					const parsed = yield* readFileId(id);
					if (parsed === undefined) {
						return yield* new StorageError({ message: 'File not found' });
					}
					const current = partsOf(parsed.key);
					const name = yield* nameKeepingType(current.name, requested).pipe(
						Effect.mapError(() => new StorageError({ message: 'Invalid file name' })),
					);
					const store = yield* requireListed(parsed.source);
					if (name === current.name) {
						return yield* toEntry({
							contentType: yield* contentTypeFromName(current.name),
							createdAt: '',
							folder: current.folder,
							key: parsed.key,
							name: current.name,
							size: 0,
							source: parsed.source,
						});
					}
					const occupied = yield* namesInFolder(
						yield* store.list(current.folder, false),
						current.folder,
					);
					if (occupied.has(name)) {
						return yield* new StorageError({ message: `"${name}" already exists in this folder` });
					}
					const nextKey = yield* storageKey(current.folder, name);
					const storageKeyValue = yield* store.relocate(parsed.key, nextKey);
					yield* audit.record('rename', `${current.name} -> ${name}`);
					return yield* toEntry({
						contentType: yield* contentTypeFromName(name),
						createdAt: '',
						folder: current.folder,
						key: storageKeyValue,
						name,
						size: 0,
						source: parsed.source,
					});
				}),
				// Signs a one-hour content URL that works without the session cookie.
				share: Effect.fn('Drive.share')(function* (id: string) {
					const parsed = yield* readFileId(id);
					if (parsed === undefined) {
						return yield* new NotFound({ message: 'File not found' });
					}
					const expiresAt = Date.now() + shareLifetime;
					const signature = signContent(secret, id, expiresAt);
					yield* audit.record('share', partsOf(parsed.key).name);
					return new ShareLink({
						url: `/api/files/${encodeURIComponent(id)}/content?exp=${expiresAt}&sig=${encodeURIComponent(signature)}`,
					});
				}),
				// Probes each configured store so the shell can hide sources that are not set up.
				sources: Effect.fn('Drive.sources')(function* () {
					const statuses: Array<SourceStatus> = [];
					for (const store of stores.all) {
						statuses.push(
							yield* sourceStatus(store, store.id === 'telegram' ? telegramUrl : undefined),
						);
					}
					return statuses;
				}),
				upload: saveUpload,
				// Fetches a public URL, then stores it with the same rules as a direct upload.
				uploadUrl: Effect.fn('Drive.uploadUrl')(function* (source, folder, url) {
					return yield* Effect.scoped(
						Effect.gen(function* () {
							const downloaded = yield* downloadPublic(url, stores.get(source).byteLimit, fs);
							return yield* saveUpload({
								contentType: downloaded.contentType,
								folder,
								name: downloaded.name,
								path: downloaded.path,
								size: downloaded.size,
								source,
							});
						}),
					);
				}),
			});
		}),
	).pipe(Layer.provide(Stores.layer));
}
