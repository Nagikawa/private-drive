import * as Config from 'effect/Config';
import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Option from 'effect/Option';
import * as Redacted from 'effect/Redacted';

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

// Treats a blank variable as unset so a half-filled credential does not look configured.
const text = (value: Option.Option<string>): string | undefined =>
	Option.match(value, {
		onNone: () => undefined,
		onSome: (item) => {
			const trimmed = item.trim();
			return trimmed === '' ? undefined : trimmed;
		},
	});

// Requires every R2 field together, because the S3 client cannot talk to a partial account.
const r2From = (
	accountId: string | undefined,
	accessKeyId: string | undefined,
	bucket: string | undefined,
	secret: Redacted.Redacted<string> | undefined,
): R2Config | undefined =>
	accountId !== undefined &&
	accessKeyId !== undefined &&
	bucket !== undefined &&
	secret !== undefined
		? { accessKeyId, accountId, bucket, secretAccessKey: secret }
		: undefined;

// Requires both the chat and the bot token, since either one alone cannot store a file.
const telegramFrom = (
	chatId: string | undefined,
	token: Redacted.Redacted<string> | undefined,
): TelegramConfig | undefined =>
	chatId !== undefined && token !== undefined ? { chatId, token } : undefined;

// Requires both the dataset repo and the token before Hugging Face writes are attempted.
const huggingfaceFrom = (
	repo: string | undefined,
	token: Redacted.Redacted<string> | undefined,
): HuggingFaceConfig | undefined =>
	repo !== undefined && token !== undefined ? { repo, token } : undefined;

// Sessions and upload temps live next to each other. An old INDEX_PATH still names that directory.
const directoryOf = (file: string): string => {
	const slash = Math.max(file.lastIndexOf('/'), file.lastIndexOf('\\'));
	return slash <= 0 ? '.' : file.slice(0, slash);
};

export class AppConfig extends Context.Service<
	AppConfig,
	{
		readonly authPassword: Redacted.Redacted<string>;
		readonly cookieSecure: boolean;
		readonly dataDir: string;
		readonly huggingface: HuggingFaceConfig | undefined;
		readonly port: number;
		readonly r2: R2Config | undefined;
		readonly sessionSecret: Redacted.Redacted<string>;
		readonly telegram: TelegramConfig | undefined;
	}
>()('private-drive/AppConfig') {
	// Loads process env once so the rest of the API reads settings from this service.
	static readonly layer = Layer.effect(
		AppConfig,
		Effect.gen(function* () {
			const env = yield* Config.all({
				authPassword: Config.Redacted('AUTH_PASSWORD'),
				cookieSecure: Config.Boolean('COOKIE_SECURE').pipe(Config.withDefault(false)),
				hfRepo: Config.option(Config.String('HF_REPO')),
				hfToken: Config.option(Config.Redacted('HF_TOKEN')),
				dataDir: Config.String('DATA_DIR').pipe(
					Config.orElse(() => Config.String('INDEX_PATH').pipe(Config.map(directoryOf))),
					Config.withDefault('data'),
				),
				port: Config.Port('PORT').pipe(Config.withDefault(8787)),
				r2AccessKeyId: Config.option(Config.String('R2_ACCESS_KEY_ID')),
				r2AccountId: Config.option(Config.String('R2_ACCOUNT_ID')),
				r2Bucket: Config.option(Config.String('R2_BUCKET')),
				r2Secret: Config.option(Config.Redacted('R2_SECRET_ACCESS_KEY')),
				sessionSecret: Config.Redacted('SESSION_SECRET'),
				tgChatId: Config.option(Config.String('TG_CHAT_ID')),
				tgToken: Config.option(Config.Redacted('TG_BOT_TOKEN')),
			});

			return AppConfig.of({
				authPassword: env.authPassword,
				cookieSecure: env.cookieSecure,
				dataDir: env.dataDir,
				huggingface: huggingfaceFrom(text(env.hfRepo), Option.getOrUndefined(env.hfToken)),
				port: env.port,
				r2: r2From(
					text(env.r2AccountId),
					text(env.r2AccessKeyId),
					text(env.r2Bucket),
					Option.getOrUndefined(env.r2Secret),
				),
				sessionSecret: env.sessionSecret,
				telegram: telegramFrom(text(env.tgChatId), Option.getOrUndefined(env.tgToken)),
			});
		}),
	);
}
