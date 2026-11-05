import { Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { Effect } from 'effect';
import {
  formatBytes,
  isAudioContent,
  isImageContent,
  isPdfContent,
  isTextContent,
  isVideoContent,
  pure,
  type FileEntry,
} from '@private-drive/domain';
import { of, switchMap } from 'rxjs';
import { DriveApi } from '../../../services/drive-api/drive-api.service';
import { DriveRuntime } from '../../../services/drive-runtime/drive-runtime.service';

@Component({
  selector: 'app-preview-dialog',
  templateUrl: './preview-dialog.html',
})
export class PreviewDialog {
  private readonly api = inject(DriveApi);
  private readonly runtime = inject(DriveRuntime);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  protected readonly entry = signal<FileEntry | undefined>(undefined);
  // Loads text when the opened file is text, and shows a fallback if the content route fails.
  protected readonly text = toSignal(
    toObservable(this.entry).pipe(
      switchMap((entry) =>
        entry !== undefined && this.isText(entry)
          ? this.runtime.bind(
              this.api
                .text(entry.id)
                .pipe(Effect.catch(() => Effect.succeed('Could not read the content'))),
            )
          : of(''),
      ),
    ),
    { initialValue: '' },
  );

  // Shows the file in the preview dialog, including text loaded from the content route.
  open(entry: FileEntry): void {
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

  // Returns the content URL the media element loads directly.
  protected contentUrl(entry: FileEntry): string {
    return this.api.contentUrl(entry.id);
  }

  // Trusts the PDF URL so the iframe can load the session-protected content route.
  protected pdfUrl(entry: FileEntry): SafeResourceUrl | undefined {
    if (!this.isPdf(entry)) {
      return undefined;
    }
    return this.sanitizer.bypassSecurityTrustResourceUrl(this.contentUrl(entry));
  }

  // True when the preview should render an image tag.
  protected isImage(entry: FileEntry): boolean {
    return pure(isImageContent(entry.contentType), false);
  }

  // True when the preview should render a video player.
  protected isVideo(entry: FileEntry): boolean {
    return pure(isVideoContent(entry.contentType), false);
  }

  // True when the preview should render an audio player.
  protected isAudio(entry: FileEntry): boolean {
    return pure(isAudioContent(entry.contentType), false);
  }

  // True when the preview should fetch and show the file as text.
  protected isText(entry: FileEntry): boolean {
    return pure(isTextContent(entry.contentType), false);
  }

  // True when the preview should embed a PDF.
  protected isPdf(entry: FileEntry): boolean {
    return pure(isPdfContent(entry.contentType), false);
  }
}
