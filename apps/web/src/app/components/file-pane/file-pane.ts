import type { FileEntry, Listing, SourceId } from '@private-drive/model';

import { CdkVirtualScrollViewport, ScrollingModule } from '@angular/cdk/scrolling';
import {
	Component,
	ElementRef,
	computed,
	effect,
	input,
	output,
	signal,
	viewChild,
} from '@angular/core';
import { isVideoContent, pure, type FolderCrumb } from '@private-drive/utils';

import { Breadcrumbs } from '../breadcrumbs/breadcrumbs';
import { FileTable, type FileRowAction } from '../file-table/file-table';
import { FolderActions, type FolderActionId } from '../folder-actions/folder-actions';
import { VideoFrame } from './video-frame';

export const fileDragType = 'application/x-private-drive-file';

export interface FilePaneToggle {
	readonly id: string;
	readonly checked: boolean;
}

export interface FilePaneAction {
	readonly file: FileEntry;
	readonly action: FileRowAction;
}

@Component({
	selector: 'app-file-pane',
	imports: [Breadcrumbs, FileTable, FolderActions, ScrollingModule, VideoFrame],
	templateUrl: './file-pane.html',
	host: { class: 'flex min-h-0 min-w-0 flex-1 flex-col' },
	styles: [
		`
			/* The scroll wrapper is only as tall as the rendered rows, which clips the card menu. */
			:host ::ng-deep .file-grid .cdk-virtual-scroll-content-wrapper {
				contain: none;
				overflow: visible;
			}
		`,
	],
})
export class FilePane {
	readonly crumbs = input<ReadonlyArray<FolderCrumb>>([]);
	readonly showCrumbs = input(true);
	readonly search = input('');
	readonly sort = input('name-asc');
	readonly page = input(1);
	readonly hasPrev = input(false);
	readonly hasNext = input(false);
	readonly listing = input<Listing | undefined>(undefined);
	readonly error = input('');
	readonly selected = input<ReadonlyArray<string>>([]);
	readonly deleteDisabled = input(true);
	readonly uploading = input(false);
	readonly uploadStatus = input('');
	readonly contentUrl = input.required<(id: string) => string>();
	readonly source = input<SourceId>('r2');
	readonly chatUrl = input('');

	readonly searched = output<string>();
	readonly sorted = output<string>();
	readonly paged = output<'prev' | 'next'>();
	readonly opened = output<string>();
	readonly toggled = output<FilePaneToggle>();
	readonly toggledAll = output<boolean>();
	readonly folderAction = output<FolderActionId>();
	readonly filesChosen = output<ReadonlyArray<File>>();
	readonly previewed = output<FileEntry>();
	readonly acted = output<FilePaneAction>();
	readonly dragStarted = output<string>();
	readonly dragEnded = output<void>();

	private readonly allBox = viewChild<ElementRef<HTMLInputElement>>('allBox');
	private readonly fileInput = viewChild.required<ElementRef<HTMLInputElement>>('fileInput');
	private readonly gridViewport = viewChild(CdkVirtualScrollViewport);
	private dragOrigin: EventTarget | null = null;

	protected readonly view = signal<'grid' | 'list'>('grid');
	protected readonly cardMenuId = signal<string | null>(null);
	// Each grid card is a fixed 200×150 tile. The virtual row adds the 12px gap under it.
	protected readonly cardWidth = 200;
	protected readonly cardHeight = 150;
	protected readonly gridGap = 12;
	protected readonly gridRowSize = this.cardHeight + this.gridGap;
	protected readonly gridColumns = signal(1);

	// True when every file in the current list is selected.
	protected readonly allSelected = computed(() => {
		const listing = this.listing();
		if (listing === undefined || listing.files.length === 0) {
			return false;
		}
		return listing.files.every((file) => this.selected().includes(file.id));
	});

	// True when the select-all box should look partial rather than checked or empty.
	protected readonly someSelected = computed(() => {
		const listing = this.listing();
		if (listing === undefined || listing.files.length === 0) {
			return false;
		}
		const count = listing.files.filter((file) => this.selected().includes(file.id)).length;
		return count > 0 && count < listing.files.length;
	});

	// Groups the current files into fixed-height rows for the virtual grid.
	protected readonly gridRows = computed(() => {
		const files = this.listing()?.files ?? [];
		const columns = Math.max(1, this.gridColumns());
		const rows: Array<ReadonlyArray<FileEntry>> = [];
		for (let index = 0; index < files.length; index += columns) {
			rows.push(files.slice(index, index + columns));
		}
		return rows;
	});

	constructor() {
		// Keeps the select-all box indeterminate when only some files are checked.
		effect(() => {
			const element = this.allBox()?.nativeElement;
			if (element !== undefined) {
				element.indeterminate = this.someSelected();
			}
		});
		// Measures the grid pane so each virtual row holds as many 200px cards as fit.
		effect((onCleanup) => {
			const viewport = this.gridViewport();
			if (viewport === undefined) {
				return;
			}
			const element = viewport.elementRef.nativeElement;
			const measure = (): void => {
				const columns = Math.max(
					1,
					Math.floor((element.clientWidth + this.gridGap) / (this.cardWidth + this.gridGap)),
				);
				this.gridColumns.set(columns);
				viewport.checkViewportSize();
			};
			measure();
			const observer = new ResizeObserver(measure);
			observer.observe(element);
			onCleanup(() => observer.disconnect());
		});
	}

	// Keeps a virtual grid row tied to its first file when the visible window changes.
	protected trackGridRow(_index: number, row: ReadonlyArray<FileEntry>): string {
		return row[0]?.id ?? String(_index);
	}

	// Writes the search box text back to the files page.
	protected onSearch(event: Event): void {
		if (event.target instanceof HTMLInputElement) {
			this.searched.emit(event.target.value);
		}
	}

	// Writes the sort choice back to the files page.
	protected onSort(event: Event): void {
		if (event.target instanceof HTMLSelectElement) {
			this.sorted.emit(event.target.value);
		}
	}

	// Reads a checkbox change without assuming every event comes from an input.
	protected checkedOf(event: Event): boolean {
		return event.target instanceof HTMLInputElement && event.target.checked;
	}

	// Switches the file pane between the grid and the list.
	protected setView(value: 'grid' | 'list'): void {
		this.view.set(value);
	}

	// Reports one file checkbox to the files page.
	protected toggle(id: string, checked: boolean): void {
		this.toggled.emit({ id, checked });
	}

	// Opens the file picker for upload, and forwards delete and new-folder to the files page.
	protected onFolderAction(id: FolderActionId): void {
		if (id === 'upload') {
			this.fileInput().nativeElement.click();
			return;
		}
		this.folderAction.emit(id);
	}

	// Sends the chosen files to the files page and clears the picker.
	protected onFiles(event: Event): void {
		const input = event.target;
		if (!(input instanceof HTMLInputElement) || input.files === null) {
			return;
		}
		const files = [...input.files];
		input.value = '';
		this.filesChosen.emit(files);
	}

	// Opens the card menu and keeps the browser menu from appearing.
	protected openCardMenu(event: MouseEvent, id: string): void {
		event.preventDefault();
		event.stopPropagation();
		this.cardMenuId.set(id);
	}

	// Closes the card menu after a left click in the file pane.
	protected closeCardMenu(event: MouseEvent): void {
		if (event.button !== 0) {
			return;
		}
		const target = event.target;
		if (target instanceof Element && target.closest('.dropdown-content') !== null) {
			return;
		}
		this.cardMenuId.set(null);
	}

	// True when the card should show a captured video frame instead of an image.
	protected isVideo(file: FileEntry): boolean {
		return pure(isVideoContent(file.contentType), false);
	}

	// Uppercases the suffix so a card with no preview can show it in the figure.
	protected extensionLabel(name: string): string {
		const dot = name.lastIndexOf('.');
		if (dot < 0 || dot === name.length - 1) {
			return '';
		}
		return name.slice(dot + 1).toUpperCase();
	}

	// Asks the files page to open the preview for an image. Other files stay in the grid.
	protected preview(file: FileEntry): void {
		if (!file.image) {
			return;
		}
		this.previewed.emit(file);
	}

	// Closes the card menu and asks the files page to download, delete, or rename this file.
	protected act(file: FileEntry, action: FileRowAction): void {
		this.cardMenuId.set(null);
		this.acted.emit({ file, action });
	}

	// Remembers where the pointer went down so a drag that starts on a control can be ignored.
	protected rememberDragOrigin(event: Event): void {
		this.dragOrigin = event.target;
	}

	// Starts a file drag unless it began on a checkbox or menu, which should keep working as controls.
	protected onFileDragStart(event: DragEvent, id: string): void {
		const origin = this.dragOrigin;
		this.dragOrigin = null;
		if (
			origin instanceof Element &&
			origin.closest('input, label, .file-action, .dropdown-content') !== null
		) {
			event.preventDefault();
			return;
		}
		const transfer = event.dataTransfer;
		if (transfer === null) {
			event.preventDefault();
			return;
		}
		transfer.setData(fileDragType, id);
		transfer.setData('text/plain', id);
		transfer.effectAllowed = 'move';
		this.dragStarted.emit(id);
	}

	// Tells the files page the pointer was released so the tree highlight can clear.
	protected onFileDragEnd(): void {
		this.dragOrigin = null;
		this.dragEnded.emit();
	}
}
