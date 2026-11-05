import * as Vitest from '@effect/vitest';
import * as Effect from 'effect/Effect';

import {
	contentTypeFromName,
	isAudioContent,
	isImageContent,
	isPdfContent,
	isTextContent,
	isVideoContent,
} from '../src/content.ts';

Vitest.describe('contentTypeFromName', () => {
	// Known image extensions map to a previewable type.
	Vitest.it.effect('maps a jpeg name', () =>
		Effect.gen(function* () {
			Vitest.expect(yield* contentTypeFromName('Cat.JPG')).toBe('image/jpeg');
		}),
	);

	// An unknown extension stays a generic download.
	Vitest.it.effect('falls back to octet-stream', () =>
		Effect.gen(function* () {
			Vitest.expect(yield* contentTypeFromName('notes.bin')).toBe('application/octet-stream');
		}),
	);
});

Vitest.describe('isAudioContent', () => {
	// Audio types use the audio player.
	Vitest.it.effect('accepts an audio type', () =>
		Effect.gen(function* () {
			Vitest.expect(yield* isAudioContent('audio/mpeg')).toBe(true);
		}),
	);
});

Vitest.describe('isImageContent', () => {
	// Image types can use the image preview.
	Vitest.it.effect('accepts an image type', () =>
		Effect.gen(function* () {
			Vitest.expect(yield* isImageContent('image/png')).toBe(true);
		}),
	);

	// Other types stay in the generic preview.
	Vitest.it.effect('rejects a video type', () =>
		Effect.gen(function* () {
			Vitest.expect(yield* isImageContent('video/mp4')).toBe(false);
		}),
	);
});

Vitest.describe('isPdfContent', () => {
	// PDF files use the embedded frame.
	Vitest.it.effect('accepts a pdf type', () =>
		Effect.gen(function* () {
			Vitest.expect(yield* isPdfContent('application/pdf')).toBe(true);
		}),
	);
});

Vitest.describe('isTextContent', () => {
	// Text and JSON are fetched and shown as text.
	Vitest.it.effect('accepts text and json', () =>
		Effect.gen(function* () {
			Vitest.expect(yield* isTextContent('text/plain')).toBe(true);
			Vitest.expect(yield* isTextContent('application/json')).toBe(true);
		}),
	);
});

Vitest.describe('isVideoContent', () => {
	// Video types use the video player.
	Vitest.it.effect('accepts a video type', () =>
		Effect.gen(function* () {
			Vitest.expect(yield* isVideoContent('video/mp4')).toBe(true);
		}),
	);
});
