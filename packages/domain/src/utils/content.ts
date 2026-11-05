import * as Effect from 'effect/Effect';

// Guesses a media type from the extension when an upload or remote listing does not provide one.
export const contentTypeFromName = Effect.fnUntraced(function* (name: string) {
	const extension = name.split('.').at(-1)?.toLowerCase() ?? '';
	const types: Readonly<Record<string, string>> = {
		jpg: 'image/jpeg',
		jpeg: 'image/jpeg',
		png: 'image/png',
		gif: 'image/gif',
		webp: 'image/webp',
		svg: 'image/svg+xml',
		avif: 'image/avif',
		mp4: 'video/mp4',
		webm: 'video/webm',
		mov: 'video/quicktime',
		mp3: 'audio/mpeg',
		wav: 'audio/wav',
		ogg: 'audio/ogg',
		pdf: 'application/pdf',
		txt: 'text/plain',
		md: 'text/markdown',
		json: 'application/json',
		zip: 'application/zip',
	};
	return types[extension] ?? 'application/octet-stream';
});

// Lets the file grid and the preview dialog decide which entries are images.
export const isImageContent = Effect.fnUntraced(function* (contentType: string) {
	return contentType.startsWith('image/');
});

// Lets the file grid capture a first-frame thumbnail for a video.
export const isVideoContent = Effect.fnUntraced(function* (contentType: string) {
	return contentType.startsWith('video/');
});

// True when the type is audio.
export const isAudioContent = Effect.fnUntraced(function* (contentType: string) {
	return contentType.startsWith('audio/');
});

// True when the body can be read as text.
export const isTextContent = Effect.fnUntraced(function* (contentType: string) {
	return contentType.startsWith('text/') || contentType === 'application/json';
});

// True when the type is a PDF.
export const isPdfContent = Effect.fnUntraced(function* (contentType: string) {
	return contentType === 'application/pdf';
});
