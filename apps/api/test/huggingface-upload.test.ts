import * as NodeFileSystem from '@effect/platform-node/NodeFileSystem';
import * as Vitest from '@effect/vitest';
import * as Effect from 'effect/Effect';
import * as FileSystem from 'effect/FileSystem';
import * as FetchHttpClient from 'effect/http/FetchHttpClient';
import * as HttpClient from 'effect/http/HttpClient';
import * as HttpClientRequest from 'effect/http/HttpClientRequest';
import * as HttpClientResponse from 'effect/http/HttpClientResponse';
import * as Result from 'effect/Result';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { join } from 'node:path';

import { HuggingFace } from '../src/storage/huggingface.ts';
import { configFor, tempDirectory } from './support.ts';

const large = 8 * 1024 * 1024 + 1;
const book = 'books/19.+诊断学（第10）n.pdf';

const requestText = (request: HttpClientRequest.HttpClientRequest): string => {
	const body = request.body;
	if (body._tag !== 'Uint8Array') {
		return '';
	}
	return body.text ?? new TextDecoder().decode(body.body);
};

const xmlRejection = `<?xml version="1.0" encoding="UTF-8"?>
<Error><Code>NotImplemented</Code><Message>A header you provided implies functionality that is not implemented</Message><Header>Transfer-Encoding</Header></Error>`;

// Answers the dataset commit locally and sends part uploads through the real fetch client.
const hubClient = (
	fetchClient: HttpClient.HttpClient,
	respond: (request: HttpClientRequest.HttpClientRequest, url: URL) => Response,
) =>
	HttpClient.make((request, url) => {
		if (url.hostname === 'huggingface.co') {
			return Effect.succeed(HttpClientResponse.fromWeb(request, respond(request, url)));
		}
		return fetchClient.execute(request);
	});

Vitest.describe('Hugging Face large upload', () => {
	// S3 describes a rejected part in XML. A status code alone hides that reason.
	Vitest.it.effect('surfaces the storage rejection message', () =>
		Effect.gen(function* () {
			const directory = yield* tempDirectory;
			const fs = yield* FileSystem.FileSystem;
			const path = join(directory, 'note.pdf');
			yield* fs.writeFile(path, new Uint8Array([1]));
			const fetchClient = yield* HttpClient.HttpClient;
			const client = hubClient(fetchClient, () => new Response(xmlRejection, { status: 501 }));
			const huggingface = yield* Effect.gen(function* () {
				return yield* HuggingFace;
			}).pipe(
				Effect.provide(HuggingFace.layer),
				Effect.provideService(HttpClient.HttpClient, client),
				Effect.provide(configFor(directory, { HF_REPO: 'owner/dataset', HF_TOKEN: 'test-token' })),
				Effect.provide(NodeFileSystem.layer),
			);
			const failed = yield* huggingface.putFile(book, path, large).pipe(Effect.result);
			Vitest.expect(Result.isFailure(failed) && failed.failure.message).toBe(
				'A header you provided implies functionality that is not implemented',
			);
		}).pipe(Effect.provide(FetchHttpClient.layer), Effect.provide(NodeFileSystem.layer)),
	);

	// S3 returns 501 when a part uses chunked transfer. The part has to carry Content-Length.
	Vitest.it.effect('uploads a large part with a content length', () =>
		Effect.gen(function* () {
			const directory = yield* tempDirectory;
			const fs = yield* FileSystem.FileSystem;
			const path = join(directory, 'book.pdf');
			yield* fs.writeFile(path, new Uint8Array(large));
			const seen: Array<{
				readonly bytes: number;
				readonly contentLength: string | undefined;
				readonly method: string;
				readonly transferEncoding: string | undefined;
				readonly url: string;
			}> = [];
			const headerValue = (value: string | ReadonlyArray<string> | undefined) =>
				Array.isArray(value) ? value[0] : value;
			const server = yield* Effect.acquireRelease(
				Effect.callback<{ readonly close: () => void; readonly port: number }>(function (resume) {
					const http = createServer((request: IncomingMessage, response: ServerResponse) => {
						let bytes = 0;
						request.on('data', (chunk: Buffer) => {
							bytes += chunk.length;
						});
						request.on('end', () => {
							const contentLength = headerValue(request.headers['content-length']);
							const transferEncoding = headerValue(request.headers['transfer-encoding']);
							seen.push({
								bytes,
								contentLength,
								method: request.method ?? '',
								transferEncoding,
								url: request.url ?? '',
							});
							if (
								request.method === 'PUT' &&
								(contentLength === undefined || transferEncoding !== undefined)
							) {
								response.writeHead(501, { 'content-type': 'application/xml' });
								response.end(xmlRejection);
								return;
							}
							response.writeHead(200, { etag: '"part-etag"' });
							response.end();
						});
					});
					const close = () => {
						http.closeAllConnections();
						http.close();
					};
					http.listen(0, '127.0.0.1', () => {
						const address = http.address();
						resume(
							Effect.succeed({
								close,
								port: typeof address === 'object' && address !== null ? address.port : 0,
							}),
						);
					});
					return Effect.sync(close);
				}),
				(started) => Effect.sync(() => started.close()),
			);
			const commits: Array<string> = [];
			const fetchClient = yield* HttpClient.HttpClient;
			const client = hubClient(fetchClient, (request, url) => {
				if (url.pathname.includes('/commit/')) {
					commits.push(requestText(request));
					return new Response(null, { status: 200 });
				}
				return Response.json({
					objects: [
						{
							actions: {
								upload: {
									header: {
										'00001': `http://127.0.0.1:${server.port}/part/1`,
										chunk_size: String(large),
									},
									href: `http://127.0.0.1:${server.port}/complete`,
								},
							},
							oid: 'ignored',
							size: large,
						},
					],
				});
			});
			const huggingface = yield* Effect.gen(function* () {
				return yield* HuggingFace;
			}).pipe(
				Effect.provide(HuggingFace.layer),
				Effect.provideService(HttpClient.HttpClient, client),
				Effect.provide(configFor(directory, { HF_REPO: 'owner/dataset', HF_TOKEN: 'test-token' })),
				Effect.provide(NodeFileSystem.layer),
			);
			yield* huggingface.putFile(book, path, large);
			Vitest.expect(seen).toEqual([
				{
					bytes: large,
					contentLength: String(large),
					method: 'PUT',
					transferEncoding: undefined,
					url: '/part/1',
				},
				{
					bytes: Vitest.expect.any(Number),
					contentLength: Vitest.expect.any(String),
					method: 'POST',
					transferEncoding: undefined,
					url: '/complete',
				},
			]);
			Vitest.expect(commits.some((body) => body.includes(book))).toBe(true);
		}).pipe(Effect.provide(FetchHttpClient.layer), Effect.provide(NodeFileSystem.layer)),
	);
});
