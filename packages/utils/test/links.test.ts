import * as Vitest from '@effect/vitest';
import * as Effect from 'effect/Effect';

import { absoluteContentUrl, contentPath, escapeHtml, formatLink } from '../src/links.ts';

const url = 'https://drive.example/api/files/cat/content';

Vitest.describe('escapeHtml', () => {
	// Markup characters in a file name cannot close the tag.
	Vitest.it.effect('escapes markup', () =>
		Effect.gen(function* () {
			Vitest.expect(yield* escapeHtml(`a&b<"c">`)).toBe('a&amp;b&lt;&quot;c&quot;&gt;');
		}),
	);
});

Vitest.describe('contentPath', () => {
	// The id is encoded so a slash in it cannot change the route.
	Vitest.it.effect('encodes the file id', () =>
		Effect.gen(function* () {
			Vitest.expect(yield* contentPath('a/b')).toBe('/api/files/a%2Fb/content');
		}),
	);
});

Vitest.describe('absoluteContentUrl', () => {
	// The origin is supplied by the caller so the helper does not touch the browser.
	Vitest.it.effect('prefixes the origin', () =>
		Effect.gen(function* () {
			Vitest.expect(yield* absoluteContentUrl('https://drive.example', 'cat')).toBe(
				'https://drive.example/api/files/cat/content',
			);
		}),
	);
});

Vitest.describe('formatLink', () => {
	// Each format matches the menu the file page copies from.
	Vitest.it.effect('formats url, markdown, html, and bbcode', () =>
		Effect.gen(function* () {
			Vitest.expect(yield* formatLink({ format: 'url', image: true, name: 'cat', url })).toBe(url);
			Vitest.expect(yield* formatLink({ format: 'markdown', image: true, name: 'cat', url })).toBe(
				`![cat](${url})`,
			);
			Vitest.expect(yield* formatLink({ format: 'markdown', image: false, name: 'cat', url })).toBe(
				`[cat](${url})`,
			);
			Vitest.expect(yield* formatLink({ format: 'html', image: false, name: 'a<b', url })).toBe(
				`<a href="${url}">a&lt;b</a>`,
			);
			Vitest.expect(yield* formatLink({ format: 'bbcode', image: true, name: 'cat', url })).toBe(
				`[img]${url}[/img]`,
			);
		}),
	);
});
