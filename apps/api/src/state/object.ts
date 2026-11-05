import { DurableObject } from 'cloudflare:workers';

const pieceSize = 512 * 1024;

const bytesOf = (value: unknown): Uint8Array => {
	if (value instanceof Uint8Array) {
		return value;
	}
	if (value instanceof ArrayBuffer) {
		return new Uint8Array(value);
	}
	return new Uint8Array();
};

const copyBytes = (bytes: Uint8Array): Uint8Array =>
	bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength ? bytes : bytes.slice();

const likePrefix = (prefix: string): string =>
	`${prefix.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')}/%`;

const objectBody = (bytes: Uint8Array): Record<string, unknown> | undefined => {
	const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
	if (typeof parsed !== 'object' || parsed === null) {
		return undefined;
	}
	return parsed as Record<string, unknown>;
};

// One strongly consistent object holds sessions, the audit log, and upload bytes.
export class DriveState extends DurableObject {
	constructor(ctx: DurableObjectState, env: CloudflareEnv) {
		super(ctx, env);
		this.ctx.storage.sql.exec(
			'CREATE TABLE IF NOT EXISTS docs (key TEXT PRIMARY KEY, value TEXT NOT NULL)',
		);
		this.ctx.storage.sql.exec(
			'CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY AUTOINCREMENT, line TEXT NOT NULL)',
		);
		this.ctx.storage.sql.exec(
			'CREATE TABLE IF NOT EXISTS blobs (path TEXT NOT NULL, idx INTEGER NOT NULL, data BLOB NOT NULL, PRIMARY KEY (path, idx))',
		);
		this.ctx.storage.sql.exec(
			'CREATE TABLE IF NOT EXISTS meta (path TEXT PRIMARY KEY, size INTEGER NOT NULL)',
		);
	}

	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);
		try {
			switch (url.pathname) {
				case '/doc':
					return this.readDoc(url.searchParams.get('key') ?? '');
				case '/cas':
					return await this.cas(request);
				case '/append':
					return await this.append(request);
				case '/bytes':
					return await this.bytes(request, url);
				case '/size':
					return this.size(url.searchParams.get('path') ?? '');
				case '/remove':
					return this.remove(url.searchParams.get('path') ?? '');
				case '/remove-prefix':
					return this.removePrefix(url.searchParams.get('prefix') ?? '');
				case '/rename':
					return await this.rename(request);
				case '/list':
					return this.list(url.searchParams.get('prefix') ?? '');
				default:
					return new Response('Not found', { status: 404 });
			}
		} catch {
			return new Response('Could not update stored state', { status: 500 });
		}
	}

	private readDoc(key: string): Response {
		const row = this.ctx.storage.sql
			.exec('SELECT value FROM docs WHERE key = ?', key)
			.toArray()[0];
		if (row === undefined) {
			return new Response(null, { status: 404 });
		}
		return new Response(String(row['value'] ?? ''));
	}

	private async cas(request: Request): Promise<Response> {
		const body = objectBody(new Uint8Array(await request.arrayBuffer()));
		if (body === undefined) {
			return new Response('Invalid state request', { status: 400 });
		}
		const key = typeof body['key'] === 'string' ? body['key'] : '';
		const expected = body['expected'];
		const value = typeof body['value'] === 'string' ? body['value'] : '';
		const status = this.ctx.storage.transactionSync(() => {
			const row = this.ctx.storage.sql
				.exec('SELECT value FROM docs WHERE key = ?', key)
				.toArray()[0];
			const current = row === undefined ? undefined : String(row['value'] ?? '');
			const wanted = expected === null || expected === undefined ? undefined : String(expected);
			if (current !== wanted) {
				return 'conflict' as const;
			}
			this.ctx.storage.sql.exec(
				'INSERT INTO docs (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
				key,
				value,
			);
			return 'ok' as const;
		});
		return Response.json({ status });
	}

	private async append(request: Request): Promise<Response> {
		const body = objectBody(new Uint8Array(await request.arrayBuffer()));
		if (body === undefined || typeof body['line'] !== 'string') {
			return new Response('Invalid state request', { status: 400 });
		}
		this.ctx.storage.sql.exec('INSERT INTO audit (line) VALUES (?)', body['line']);
		return new Response(null, { status: 204 });
	}

	private async bytes(request: Request, url: URL): Promise<Response> {
		const path = url.searchParams.get('path') ?? '';
		if (request.method === 'GET') {
			const offset = Number(url.searchParams.get('offset') ?? '0');
			const length = Number(url.searchParams.get('length') ?? '0');
			const bytes = this.ctx.storage.transactionSync(() => this.readAt(path, offset, length));
			if (bytes === undefined) {
				return new Response(null, { status: 404 });
			}
			const payload = bytes.slice();
			return new Response(payload.buffer);
		}
		if (request.method !== 'PUT') {
			return new Response('Method not allowed', { status: 405 });
		}
		const input = new Uint8Array(await request.arrayBuffer());
		const offset = Number(url.searchParams.get('offset') ?? '0');
		this.ctx.storage.transactionSync(() => {
			this.writeAt(path, offset, input);
		});
		return new Response(null, { status: 204 });
	}

	private size(path: string): Response {
		const row = this.ctx.storage.sql
			.exec('SELECT size FROM meta WHERE path = ?', path)
			.toArray()[0];
		const size = row === undefined ? null : Number(row['size']);
		return Response.json({ size });
	}

	private remove(path: string): Response {
		this.ctx.storage.transactionSync(() => {
			this.ctx.storage.sql.exec('DELETE FROM blobs WHERE path = ?', path);
			this.ctx.storage.sql.exec('DELETE FROM meta WHERE path = ?', path);
		});
		return new Response(null, { status: 204 });
	}

	private removePrefix(prefix: string): Response {
		const pattern = likePrefix(prefix);
		this.ctx.storage.transactionSync(() => {
			this.ctx.storage.sql.exec(
				"DELETE FROM blobs WHERE path = ? OR path LIKE ? ESCAPE '\\'",
				prefix,
				pattern,
			);
			this.ctx.storage.sql.exec(
				"DELETE FROM meta WHERE path = ? OR path LIKE ? ESCAPE '\\'",
				prefix,
				pattern,
			);
		});
		return new Response(null, { status: 204 });
	}

	private async rename(request: Request): Promise<Response> {
		const body = objectBody(new Uint8Array(await request.arrayBuffer()));
		if (body === undefined) {
			return new Response('Invalid state request', { status: 400 });
		}
		const from = typeof body['from'] === 'string' ? body['from'] : '';
		const to = typeof body['to'] === 'string' ? body['to'] : '';
		this.ctx.storage.transactionSync(() => {
			this.ctx.storage.sql.exec('DELETE FROM blobs WHERE path = ?', to);
			this.ctx.storage.sql.exec('DELETE FROM meta WHERE path = ?', to);
			this.ctx.storage.sql.exec('UPDATE blobs SET path = ? WHERE path = ?', to, from);
			this.ctx.storage.sql.exec('UPDATE meta SET path = ? WHERE path = ?', to, from);
		});
		return new Response(null, { status: 204 });
	}

	private list(prefix: string): Response {
		const pattern = likePrefix(prefix);
		const rows = this.ctx.storage.sql
			.exec("SELECT path FROM meta WHERE path = ? OR path LIKE ? ESCAPE '\\'", prefix, pattern)
			.toArray();
		return Response.json({ paths: rows.map((row) => String(row['path'] ?? '')) });
	}

	private readAt(path: string, offset: number, length: number): Uint8Array | undefined {
		const row = this.ctx.storage.sql
			.exec('SELECT size FROM meta WHERE path = ?', path)
			.toArray()[0];
		if (row === undefined || !Number.isFinite(offset) || !Number.isFinite(length) || length < 0) {
			return undefined;
		}
		const size = Number(row['size']);
		const end = Math.min(size, offset + length);
		if (end <= offset) {
			return new Uint8Array();
		}
		const output = new Uint8Array(end - offset);
		const startIdx = Math.floor(offset / pieceSize);
		const endIdx = Math.floor((end - 1) / pieceSize);
		for (let idx = startIdx; idx <= endIdx; idx++) {
			const pieceRow = this.ctx.storage.sql
				.exec('SELECT data FROM blobs WHERE path = ? AND idx = ?', path, idx)
				.toArray()[0];
			if (pieceRow === undefined) {
				continue;
			}
			const piece = bytesOf(pieceRow['data']);
			const pieceStart = idx * pieceSize;
			const overlapStart = Math.max(offset, pieceStart);
			const overlapEnd = Math.min(end, pieceStart + piece.byteLength);
			if (overlapEnd <= overlapStart) {
				continue;
			}
			output.set(
				piece.subarray(overlapStart - pieceStart, overlapEnd - pieceStart),
				overlapStart - offset,
			);
		}
		return output;
	}

	private writeAt(path: string, offset: number, bytes: Uint8Array): void {
		const row = this.ctx.storage.sql
			.exec('SELECT size FROM meta WHERE path = ?', path)
			.toArray()[0];
		const current = row === undefined ? 0 : Number(row['size']);
		if (bytes.byteLength === 0) {
			this.ctx.storage.sql.exec(
				'INSERT INTO meta (path, size) VALUES (?, ?) ON CONFLICT(path) DO UPDATE SET size = excluded.size',
				path,
				Math.max(current, offset),
			);
			return;
		}
		const end = offset + bytes.byteLength;
		const startIdx = Math.floor(offset / pieceSize);
		const endIdx = Math.floor((end - 1) / pieceSize);
		for (let idx = startIdx; idx <= endIdx; idx++) {
			const pieceStart = idx * pieceSize;
			const pieceRow = this.ctx.storage.sql
				.exec('SELECT data FROM blobs WHERE path = ? AND idx = ?', path, idx)
				.toArray()[0];
			const existing = pieceRow === undefined ? new Uint8Array() : bytesOf(pieceRow['data']);
			const overlapStart = Math.max(offset, pieceStart);
			const overlapEnd = Math.min(end, pieceStart + pieceSize);
			const buf = new Uint8Array(Math.max(existing.byteLength, overlapEnd - pieceStart));
			if (existing.byteLength > 0) {
				buf.set(existing.subarray(0, buf.byteLength));
			}
			buf.set(
				bytes.subarray(overlapStart - offset, overlapEnd - overlapStart),
				overlapStart - pieceStart,
			);
			this.ctx.storage.sql.exec(
				'INSERT INTO blobs (path, idx, data) VALUES (?, ?, ?) ON CONFLICT(path, idx) DO UPDATE SET data = excluded.data',
				path,
				idx,
				copyBytes(buf),
			);
		}
		this.ctx.storage.sql.exec(
			'INSERT INTO meta (path, size) VALUES (?, ?) ON CONFLICT(path) DO UPDATE SET size = excluded.size',
			path,
			Math.max(current, end),
		);
	}
}
