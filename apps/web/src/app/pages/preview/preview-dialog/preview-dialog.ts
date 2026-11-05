import type { FileEntry } from '@private-drive/model';

import { Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { formatBytes, isImageContent, pure } from '@private-drive/utils';

import { DriveApi } from '../../../services/drive-api/drive-api.service';

@Component({
	selector: 'app-preview-dialog',
	templateUrl: './preview-dialog.html',
})
export class PreviewDialog {
	private readonly api = inject(DriveApi);
	private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
	protected readonly entry = signal<FileEntry | undefined>(undefined);

	// Shows an image in the preview dialog. Videos and other files stay closed.
	open(entry: FileEntry): void {
		if (!this.isImage(entry)) {
			return;
		}
		this.entry.set(entry);
		const element = this.dialog().nativeElement;
		if (!element.open) {
			element.showModal();
		}
	}

	// Formats the file size with the same units the file list uses.
	protected sizeLabel(entry: FileEntry): string {
		return pure(formatBytes(entry.size), `${entry.size} B`);
	}

	// Returns the content URL the image loads directly.
	protected contentUrl(entry: FileEntry): string {
		return this.api.contentUrl(entry.id);
	}

	// True when the dialog should render an image tag.
	protected isImage(entry: FileEntry): boolean {
		return pure(isImageContent(entry.contentType), false);
	}
}
