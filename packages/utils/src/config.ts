import { type HuggingFaceConfig, type R2Config, type TelegramConfig } from '@private-drive/model';
import * as Effect from 'effect/Effect';
import * as Option from 'effect/Option';
import * as Redacted from 'effect/Redacted';

// Treats a blank variable as unset so a half-filled credential does not look configured.
export const presentText = Effect.fnUntraced(function* (value: Option.Option<string>) {
	return Option.match(value, {
		onNone: () => undefined,
		onSome: (item) => {
			const trimmed = item.trim();
			return trimmed === '' ? undefined : trimmed;
		},
	});
});

// Sessions and upload temps live next to each other. An old INDEX_PATH still names that directory.
export const directoryOf = Effect.fnUntraced(function* (file: string) {
	const slash = Math.max(file.lastIndexOf('/'), file.lastIndexOf('\\'));
	return slash <= 0 ? '.' : file.slice(0, slash);
});

// Requires every R2 field together, because the S3 client cannot talk to a partial account.
export const r2Settings = Effect.fnUntraced(function* (
	accountId: string | undefined,
	accessKeyId: string | undefined,
	bucket: string | undefined,
	secret: Redacted.Redacted<string> | undefined,
) {
	return accountId !== undefined &&
		accessKeyId !== undefined &&
		bucket !== undefined &&
		secret !== undefined
		? ({ accessKeyId, accountId, bucket, secretAccessKey: secret } satisfies R2Config)
		: undefined;
});

// Requires both the chat and the bot token, since either one alone cannot store a file.
export const telegramSettings = Effect.fnUntraced(function* (
	chatId: string | undefined,
	token: Redacted.Redacted<string> | undefined,
) {
	return chatId !== undefined && token !== undefined
		? ({ chatId, token } satisfies TelegramConfig)
		: undefined;
});

// Requires both the dataset repo and the token before Hugging Face writes are attempted.
export const huggingfaceSettings = Effect.fnUntraced(function* (
	repo: string | undefined,
	token: Redacted.Redacted<string> | undefined,
) {
	return repo !== undefined && token !== undefined
		? ({ repo, token } satisfies HuggingFaceConfig)
		: undefined;
});
