import { NgTemplateOutlet } from '@angular/common';
import { Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { type FolderNode } from '@private-drive/domain';

export interface FolderTreeDrag {
  readonly event: DragEvent;
  readonly path: string;
}

@Component({
  selector: 'app-folder-tree',
  imports: [NgTemplateOutlet, RouterLink],
  templateUrl: './folder-tree.html',
  host: {
    class:
      'flex min-h-0 w-full flex-1 flex-col overflow-auto md:w-[30%] md:max-w-[300px] md:flex-none md:shrink-0',
  },
})
export class FolderTree {
  readonly nodes = input<ReadonlyArray<FolderNode>>([]);
  readonly folder = input('');
  readonly dropTarget = input<string | null>(null);
  readonly opened = output<string>();
  readonly draggedOver = output<FolderTreeDrag>();
  readonly draggedLeave = output<FolderTreeDrag>();
  readonly dropped = output<FolderTreeDrag>();

  // Keeps a branch open when the current folder is that node or inside it.
  protected expanded(path: string): boolean {
    const current = this.folder();
    return current === path || current.startsWith(`${path}/`);
  }

  // Opens a branch folder without toggling the disclosure, which the route controls.
  protected choose(event: Event, path: string): void {
    event.preventDefault();
    this.opened.emit(path);
  }

  // Forwards a drag so the files page can highlight the row and allow the drop.
  protected dragOver(event: DragEvent, path: string): void {
    this.draggedOver.emit({ event, path });
  }

  // Forwards a drag leave so the files page can clear the row highlight.
  protected dragLeave(event: DragEvent, path: string): void {
    this.draggedLeave.emit({ event, path });
  }

  // Forwards a drop so the files page can move the file. The tree does not navigate.
  protected drop(event: DragEvent, path: string): void {
    this.dropped.emit({ event, path });
  }
}
