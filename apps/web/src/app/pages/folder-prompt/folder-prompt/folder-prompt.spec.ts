import { TestBed } from '@angular/core/testing';
import { FolderPrompt } from './folder-prompt';

describe('FolderPrompt', () => {
  // A new folder and a rename share this dialog, so the title can change.
  it('shows the requested title', () => {
    HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
      this.open = true;
    };
    TestBed.configureTestingModule({ imports: [FolderPrompt] });
    const fixture = TestBed.createComponent(FolderPrompt);
    fixture.detectChanges();
    fixture.componentInstance.open('notes.txt', 'Rename', 'Rename');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Rename');
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    expect(input.value).toBe('notes.txt');
  });
});
