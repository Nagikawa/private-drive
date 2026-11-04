import { TestBed } from '@angular/core/testing';
import { FolderActions } from './folder-actions';

describe('FolderActions', () => {
  // Delete stays off until something is selected. Upload stays available.
  it('disables delete and emits the upload action', () => {
    TestBed.configureTestingModule({ imports: [FolderActions] });
    const fixture = TestBed.createComponent(FolderActions);
    const chosen: Array<string> = [];
    fixture.componentInstance.chosen.subscribe((id) => chosen.push(id));
    fixture.detectChanges();
    const deleteButton = fixture.nativeElement.querySelector('[aria-label="Delete selected"]') as HTMLButtonElement;
    const uploadButton = fixture.nativeElement.querySelector('[aria-label="Upload files"]') as HTMLButtonElement;
    expect(deleteButton.disabled).toBe(true);
    uploadButton.click();
    expect(chosen).toEqual(['upload']);
  });
});
