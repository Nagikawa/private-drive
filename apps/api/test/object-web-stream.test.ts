import { describe, expect, it } from 'vitest';

import { objectWebStream } from '../src/storage/r2.ts';

describe('objectWebStream', () => {
	it('uses transformToWebStream when the SDK provides it', () => {
		const stream = new ReadableStream<Uint8Array>();
		expect(objectWebStream({ transformToWebStream: () => stream })).toBe(stream);
	});

	it('reads a checksum stream that is only a ReadableStream', () => {
		const stream = new ReadableStream<Uint8Array>();
		expect(objectWebStream(stream)).toBe(stream);
	});

	it('rejects a body that cannot be streamed', () => {
		expect(objectWebStream(undefined)).toBeUndefined();
		expect(objectWebStream({ transformToWebStream: () => 'nope' })).toBeUndefined();
	});
});
