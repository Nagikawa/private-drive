import { Component, input, output } from '@angular/core';
import { FolderCrumb } from '@private-drive/domain';

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
