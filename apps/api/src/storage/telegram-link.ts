import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';
import * as SchemaGetter from 'effect/SchemaGetter';

const username = /^[A-Za-z][A-Za-z0-9_]{4,31}$/;

// Turns one accepted chat id shape into https://t.me/... and back.
const linkFrom = (
	pattern: RegExp,
	toUrl: (value: string) => string,
	fromUrl: (url: string) => string,
) =>
	Schema.String.check(Schema.isPattern(pattern)).pipe(
		Schema.decodeTo(Schema.String, {
			decode: SchemaGetter.transform(toUrl),
			encode: SchemaGetter.transform(fromUrl),
		}),
	);

// Public chat addresses only. core.telegram.org/api/links has no chat-only URL for a basic group,
// no t.me link for an arbitrary user id, and no query that opens a chat's shared media.
const ChatLink = Schema.Union([
	linkFrom(
		/^-100[1-9]\d*$/,
		(id) => `https://t.me/c/${id.slice(4)}`,
		(url) => `-100${url.slice('https://t.me/c/'.length)}`,
	),
	linkFrom(
		/^(?:https?:\/\/)?(?:www\.)?(?:t\.me|telegram\.me)\/c\/[1-9]\d*\/?$/,
		(value) => {
			const id = /\/c\/([1-9]\d*)/.exec(value)?.[1];
			return id === undefined ? value : `https://t.me/c/${id}`;
		},
		(url) => url,
	),
	linkFrom(
		/^@[A-Za-z][A-Za-z0-9_]{4,31}$/,
		(value) => `https://t.me/${value.slice(1)}`,
		(url) => `@${url.slice('https://t.me/'.length)}`,
	),
	linkFrom(
		/^(?:https?:\/\/)?(?:www\.)?(?:t\.me|telegram\.me)\/[A-Za-z][A-Za-z0-9_]{4,31}\/?$/,
		(value) => {
			const name = /\/([A-Za-z][A-Za-z0-9_]{4,31})\/?$/.exec(value)?.[1];
			return name === undefined ? value : `https://t.me/${name}`;
		},
		(url) => url,
	),
	linkFrom(
		username,
		(value) => `https://t.me/${value}`,
		(url) => url.slice('https://t.me/'.length),
	),
]);

// Builds the Telegram chat address from TG_CHAT_ID. Unrecognized ids produce no URL.
export const telegramChatUrl = Effect.fnUntraced(function* (chatId: string) {
	return yield* Schema.decodeUnknownEffect(ChatLink)(chatId.trim()).pipe(
		Effect.orElseSucceed(() => undefined),
	);
});
