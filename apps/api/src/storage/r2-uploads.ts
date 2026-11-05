import { type PendingUpload } from '@private-drive/model';
import { pendingUploads, pure } from '@private-drive/utils';
import { readFile, writeFile } from 'node:fs/promises';

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

export const readPendingUploads = (path: string): Promise<ReadonlyArray<PendingUpload>> =>
	exclusive(async () => {
		try {
			return pure(pendingUploads(await readFile(path, 'utf8')), []);
		} catch {
			return [];
		}
	});

export const rememberUpload = (path: string, upload: PendingUpload): Promise<void> =>
	exclusive(async () => {
		let current: Array<PendingUpload> = [];
		try {
			current = [...pure(pendingUploads(await readFile(path, 'utf8')), [])];
		} catch {
			current = [];
		}
		await writeFile(path, JSON.stringify([...current, upload]));
	});

export const forgetUpload = (path: string, uploadId: string): Promise<void> =>
	exclusive(async () => {
		let current: Array<PendingUpload> = [];
		try {
			current = [...pure(pendingUploads(await readFile(path, 'utf8')), [])];
		} catch {
			return;
		}
		await writeFile(path, JSON.stringify(current.filter((item) => item.uploadId !== uploadId)));
	});
