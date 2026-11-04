import { Component, input, output } from '@angular/core';
import { ScrollingModule } from '@angular/cdk/scrolling';
import { formatBytes as formatByteCount, pure, type FileEntry } from '@private-drive/domain';

export interface FileTableToggle {
  readonly id: string;
  readonly checked: boolean;
}

export type FileRowAction = 'download' | 'share' | 'delete' | 'rename';

export interface FileTableDrag {
  readonly event: DragEvent;
  readonly id: string;
}

@Component({
  selector: 'app-file-table',
  imports: [ScrollingModule],
  templateUrl: './file-table.html',
  host: {
    class: 'flex h-full min-h-0 min-w-0 flex-1 flex-col',
    '[style.--file-row.px]': 'itemSize',
  },
  styles: [
    `
      tbody tr,
      tbody tr :is(th, td) {
        box-sizing: border-box;
        height: var(--file-row);
      }

      /* The scroll wrapper is only as tall as the rendered rows, which clips the link menu. */
      :host ::ng-deep .cdk-virtual-scroll-content-wrapper {
        contain: none;
        overflow: visible;
        z-index: 1;
      }
    `,
  ],
})
export class FileTable {
  readonly files = input<ReadonlyArray<FileEntry>>([]);
  readonly selected = input<ReadonlyArray<string>>([]);
  readonly toggled = output<FileTableToggle>();
  readonly previewed = output<FileEntry>();
  readonly acted = output<{ file: FileEntry; action: FileRowAction }>();
  readonly pressed = output<Event>();
  readonly dragStarted = output<FileTableDrag>();
  readonly dragEnded = output<void>();

  // Measured list row: 12px cell padding, a 24px control, and the 1px divider.
  protected readonly itemSize = 49;

  // Formats a file size at the template boundary, where the effect cannot be yielded.
  protected formatBytes(size: number): string {
    return pure(formatByteCount(size), `${size} B`);
  }

  // Keeps virtual rows tied to the file id when the visible window changes.
  protected trackFile(_index: number, file: FileEntry): string {
    return file.id;
  }

  // Reports a checkbox change so the files page can keep the selection.
  protected toggle(id: string, event: Event): void {
    this.toggled.emit({
      id,
      checked: event.target instanceof HTMLInputElement && event.target.checked,
    });
  }

  // Asks the files page to open the preview for this row.
  protected preview(file: FileEntry): void {
    this.previewed.emit(file);
  }

  // Asks the files page to download, delete, or rename this row.
  protected act(file: FileEntry, action: FileRowAction): void {
    this.acted.emit({ file, action });
  }

  // Forwards the pointer down so the files page can ignore drags that start on a control.
  protected press(event: Event): void {
    this.pressed.emit(event);
  }

  // Forwards the drag start so the files page can put the file id on the transfer.
  protected dragStart(event: DragEvent, id: string): void {
    this.dragStarted.emit({ event, id });
  }

  // Forwards the drag end so the files page can clear the tree highlight.
  protected dragEnd(): void {
    this.dragEnded.emit();
  }
}
