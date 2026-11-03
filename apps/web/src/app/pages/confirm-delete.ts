import { Component, ElementRef, output, signal, viewChild } from '@angular/core';

@Component({
  selector: 'app-confirm-delete',
  template: `
    <dialog class="modal" #dialog (close)="onClose()">
      <div class="modal-box">
        <h3 class="text-lg font-bold">{{ title() }}</h3>
        <p class="py-4">{{ message() }}</p>
        <div class="modal-action">
          <button class="btn" type="button" (click)="cancel()">Cancel</button>
          <button class="btn btn-error" type="button" (click)="accept()">Delete</button>
        </div>
      </div>
    </dialog>
  `,
})
export class ConfirmDelete {
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  readonly closed = output<boolean>();
  protected readonly title = signal('');
  protected readonly message = signal('');
  private accepted = false;

  // Opens the confirmation dialog with the title and message for this delete.
  open(title: string, message: string): void {
    this.title.set(title);
    this.message.set(message);
    this.accepted = false;
    const element = this.dialog().nativeElement;
    if (!element.open) {
      element.showModal();
    }
  }

  // Closes the dialog and records that the user confirmed the delete.
  protected accept(): void {
    this.accepted = true;
    this.dialog().nativeElement.close();
  }

  // Closes the dialog without deleting anything.
  protected cancel(): void {
    this.accepted = false;
    this.dialog().nativeElement.close();
  }

  // Emits the dialog result after it finishes closing, so the parent can delete or ignore.
  protected onClose(): void {
    const accepted = this.accepted;
    this.accepted = false;
    this.closed.emit(accepted);
  }
}
