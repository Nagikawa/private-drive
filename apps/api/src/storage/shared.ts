import { StorageError, type SourceId } from '@private-drive/domain';

// Telegram's bot API rejects a document above 50 MB. R2 and Hugging Face stream, so they have no app cap.
export const limits: Partial<Record<SourceId, number>> = {
	telegram: 50 * 1024 * 1024,
};

export const labels: Record<SourceId, string> = {
	huggingface: 'Hugging Face',
	r2: 'Cloudflare R2',
	telegram: 'Telegram',
};

// Marker object so an empty folder still exists in stores that have no directory entries.
export const keepName = '.keep';

export interface RemoteFile {
	readonly contentType: string;
	readonly createdAt?: string;
	readonly key: string;
	readonly size: number;
}

export interface RemoteListing {
	readonly files: ReadonlyArray<RemoteFile>;
	readonly folders: ReadonlyArray<string>;
	readonly truncated: boolean;
}

// Explains a missing provider with the same message the routes already show to the client.
export const unavailable = (source: SourceId): StorageError =>
	new StorageError({ message: `${labels[source]} is not set in the environment` });

// Counts payload bytes the same way the size limit and the index record do.
export const bytesOf = (value: Uint8Array): number => value.byteLength;
