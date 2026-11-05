import { TestBed } from '@angular/core/testing';
import { ConfirmDelete } from './confirm-delete';

describe('ConfirmDelete', () => {
  // Accepting the dialog is the only result that deletes.
  it('emits acceptance after Delete and rejection after Cancel', () => {
    HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
      this.open = true;
    };
    HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
      this.open = false;
      this.dispatchEvent(new Event('close'));
    };
    TestBed.configureTestingModule({ imports: [ConfirmDelete] });
    const fixture = TestBed.createComponent(ConfirmDelete);
    fixture.detectChanges();
    const results: Array<boolean> = [];
    fixture.componentInstance.closed.subscribe((accepted) => results.push(accepted));
    fixture.componentInstance.open('Delete file', 'Delete notes.txt?');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Delete notes.txt?');
    const [cancel, accept] = fixture.nativeElement.querySelectorAll(
      'button',
    ) as NodeListOf<HTMLButtonElement>;
    accept?.click();
    cancel?.click();
    expect(results).toEqual([true, false]);
  });
});
