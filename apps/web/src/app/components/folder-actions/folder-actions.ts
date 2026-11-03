import { Component, computed, input, output } from '@angular/core';

export type FolderActionId = 'delete' | 'upload' | 'folder';

interface FolderAction {
  readonly id: FolderActionId;
  readonly label: string;
  readonly svg: string;
  readonly disabled: boolean;
}

const trash =
  'M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0';

const plus = 'M12 4.5v15m7.5-7.5h-15';

const folderPlus =
  'M12 10.5v6m3-3H9m4.06-7.19-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z';

@Component({
  selector: 'app-folder-actions',
  templateUrl: './folder-actions.html',
  host: {
    class: 'flex items-center gap-1',
    role: 'group',
    'aria-label': 'Current folder actions',
  },
})
export class FolderActions {
  readonly deleteDisabled = input(true);
  readonly uploadDisabled = input(false);
  readonly chosen = output<FolderActionId>();

  // Rebuilds the icon row when delete or upload becomes unavailable.
  protected readonly actions = computed((): ReadonlyArray<FolderAction> => [
    { id: 'delete', label: 'Delete selected', svg: trash, disabled: this.deleteDisabled() },
    { id: 'upload', label: 'Upload files', svg: plus, disabled: this.uploadDisabled() },
    { id: 'folder', label: 'New folder', svg: folderPlus, disabled: false },
  ]);

  // Tells the files page which current-folder action was pressed.
  protected choose(id: FolderActionId): void {
    this.chosen.emit(id);
  }
}
