import type { FolderCrumb } from '@private-drive/utils';

import { Component, input, output } from '@angular/core';

@Component({
	selector: 'app-breadcrumbs',
	templateUrl: './breadcrumbs.html',
	host: {
		class: 'breadcrumbs text-sm',
		'aria-label': 'Folder path',
	},
})
export class Breadcrumbs {
	readonly crumbs = input<ReadonlyArray<FolderCrumb>>([]);
	readonly opened = output<string>();

	// Opens the folder for the crumb the user chose. Root is an empty path.
	protected choose(path: string): void {
		this.opened.emit(path);
	}
}
