import type { SourceId } from '../model.ts';

const sources = new Set<string>(['huggingface', 'r2', 'telegram']);

const encode = (value: string): string => {
	const bytes = new TextEncoder().encode(value);
	let binary = '';
	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}
	return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
};

const decode = (value: string): string | undefined => {
	try {
		const padded = value.replaceAll('-', '+').replaceAll('_', '/');
		const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
		const binary = atob(`${padded}${pad}`);
		const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
		const text = new TextDecoder().decode(bytes);
		return text === '' ? undefined : text;
	} catch {
		return undefined;
	}
};

// One path segment for a stored object. The catalog no longer assigns its own id.
export const fileId = (source: SourceId, key: string): string => encode(`${source}\n${key}`);

// Reads the source and storage key back out of a content URL.
export const readFileId = (
	id: string,
): { readonly key: string; readonly source: SourceId } | undefined => {
	const text = decode(id);
	if (text === undefined) {
		return undefined;
	}
	const split = text.indexOf('\n');
	if (split <= 0) {
		return undefined;
	}
	const source = text.slice(0, split);
	const key = text.slice(split + 1);
	if (!sources.has(source) || key === '') {
		return undefined;
	}
	return { key, source: source as SourceId };
};
