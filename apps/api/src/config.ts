import { type HuggingFaceConfig, type R2Config, type TelegramConfig } from '@private-drive/model';
import {
	directoryOf,
	huggingfaceSettings,
	presentText,
	r2Settings,
	telegramSettings,
} from '@private-drive/utils';
import * as Config from 'effect/Config';
import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Option from 'effect/Option';
import * as Redacted from 'effect/Redacted';

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
					Config.orElse(() => Config.String('INDEX_PATH').pipe(Config.mapEffect(directoryOf))),
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
				huggingface: yield* huggingfaceSettings(
					yield* presentText(env.hfRepo),
					Option.getOrUndefined(env.hfToken),
				),
				port: env.port,
				r2: yield* r2Settings(
					yield* presentText(env.r2AccountId),
					yield* presentText(env.r2AccessKeyId),
					yield* presentText(env.r2Bucket),
					Option.getOrUndefined(env.r2Secret),
				),
				sessionSecret: env.sessionSecret,
				telegram: yield* telegramSettings(
					yield* presentText(env.tgChatId),
					Option.getOrUndefined(env.tgToken),
				),
			});
		}),
	);
}
