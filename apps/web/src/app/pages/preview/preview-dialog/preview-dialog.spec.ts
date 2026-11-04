import { TestBed } from '@angular/core/testing';
import { FileEntry } from '@private-drive/domain';
import { PreviewDialog } from './preview-dialog';
import { driveProviders } from '../../../../testing/runtime';

describe('PreviewDialog', () => {
  // An image preview uses the content URL for that file.
  it('shows the file name when opened', () => {
    HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
      this.open = true;
    };
    TestBed.configureTestingModule({
      imports: [PreviewDialog],
      providers: driveProviders(),
    });
    const fixture = TestBed.createComponent(PreviewDialog);
    fixture.detectChanges();
    fixture.componentInstance.open(
      new FileEntry({
        contentType: 'image/jpeg',
        createdAt: '2026-01-01T00:00:00.000Z',
        folder: '',
        id: '1',
        image: true,
        name: 'photo.jpg',
        size: 10,
        source: 'r2',
      }),
    );
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('photo.jpg');
    const image = fixture.nativeElement.querySelector('img') as HTMLImageElement;
    expect(image.getAttribute('src')).toContain('/api/files/1/content');
  });
});
