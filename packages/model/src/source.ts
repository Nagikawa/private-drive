import type * as Redacted from 'effect/Redacted';

import type { SourceId } from './model.ts';

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

export interface R2Config {
	readonly accountId: string;
	readonly accessKeyId: string;
	readonly bucket: string;
	readonly secretAccessKey: Redacted.Redacted<string>;
}

export interface TelegramConfig {
	readonly chatId: string;
	readonly token: Redacted.Redacted<string>;
}

export interface HuggingFaceConfig {
	readonly repo: string;
	readonly token: Redacted.Redacted<string>;
}

// Nonces still accepted by the session ledger, keyed to the cookie expiry.
export type SessionBook = Record<string, number>;
