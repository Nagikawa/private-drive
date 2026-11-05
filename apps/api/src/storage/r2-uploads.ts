import { readFile, writeFile } from 'node:fs/promises';

export interface PendingUpload {
	readonly key: string;
	readonly uploadId: string;
}

let chain = Promise.resolve();

// One process can start two large uploads. Their journal edits have to stay in order.
const exclusive = <A>(run: () => Promise<A>): Promise<A> => {
	const result = chain.then(run, run);
	chain = result.then(
		() => undefined,
		() => undefined,
	);
	return result;
};

const parse = (text: string): Array<PendingUpload> => {
	try {
		const value: unknown = JSON.parse(text);
		if (!Array.isArray(value)) {
			return [];
		}
		const uploads: Array<PendingUpload> = [];
		for (const item of value) {
			if (typeof item !== 'object' || item === null || !('key' in item) || !('uploadId' in item)) {
				continue;
			}
			const { key, uploadId } = item;
			if (
				typeof key === 'string' &&
				typeof uploadId === 'string' &&
				key !== '' &&
				uploadId !== ''
			) {
				uploads.push({ key, uploadId });
			}
		}
		return uploads;
	} catch {
		return [];
	}
};

export const readPendingUploads = (path: string): Promise<ReadonlyArray<PendingUpload>> =>
	exclusive(async () => {
		try {
			return parse(await readFile(path, 'utf8'));
		} catch {
			return [];
		}
	});

export const rememberUpload = (path: string, upload: PendingUpload): Promise<void> =>
	exclusive(async () => {
		let current: Array<PendingUpload> = [];
		try {
			current = parse(await readFile(path, 'utf8'));
		} catch {
			current = [];
		}
		await writeFile(path, JSON.stringify([...current, upload]));
	});

export const forgetUpload = (path: string, uploadId: string): Promise<void> =>
	exclusive(async () => {
		let current: Array<PendingUpload> = [];
		try {
			current = parse(await readFile(path, 'utf8'));
		} catch {
			return;
		}
		await writeFile(path, JSON.stringify(current.filter((item) => item.uploadId !== uploadId)));
	});
