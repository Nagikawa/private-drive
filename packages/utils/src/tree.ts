import * as Effect from 'effect/Effect';

import { folderName, parentFolder } from './paths.ts';

export interface FolderNode {
	readonly name: string;
	readonly path: string;
	readonly children: ReadonlyArray<FolderNode>;
}

export interface FolderCrumb {
	readonly name: string;
	readonly path: string;
}

// Nests folder paths into a tree, filling in missing parents so a deep folder still has a place to hang.
export const folderTree = Effect.fnUntraced(function* (
	folders: ReadonlyArray<{ readonly path: string }>,
) {
	const paths = new Set(folders.map((folder) => folder.path));
	// Snapshot the set. The loop inserts missing parents, so a live iteration would visit those inserts.
	// oxlint-disable-next-line unicorn/no-useless-spread
	for (const path of [...paths]) {
		let parent = yield* parentFolder(path);
		while (parent !== '') {
			paths.add(parent);
			parent = yield* parentFolder(parent);
		}
	}
	const nodes = new Map<string, { name: string; path: string; children: Array<FolderNode> }>();
	const ordered = [...paths].sort((left, right) => left.localeCompare(right, 'zh-Hant'));
	for (const path of ordered) {
		nodes.set(path, { children: [], name: yield* folderName(path), path });
	}
	const roots: Array<FolderNode> = [];
	for (const node of nodes.values()) {
		const parent = nodes.get(yield* parentFolder(node.path));
		if (parent === undefined) {
			roots.push(node);
		} else {
			parent.children.push(node);
		}
	}
	return roots;
});

// Splits a folder into breadcrumb segments, leaving Root as an empty list.
export const folderCrumbs = Effect.fnUntraced(function* (folder: string) {
	if (folder === '') {
		return [] as ReadonlyArray<FolderCrumb>;
	}
	const parts = folder.split('/');
	return parts.map((name, index) => ({ name, path: parts.slice(0, index + 1).join('/') }));
});
