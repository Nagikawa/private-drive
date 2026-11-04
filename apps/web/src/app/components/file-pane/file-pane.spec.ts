import { TestBed } from '@angular/core/testing';
import { Listing } from '@private-drive/domain';
import { FilePane } from './file-pane';

describe('FilePane', () => {
  // An empty listing tells the user there is nothing in this folder.
  it('shows an empty folder and emits a sort change', () => {
    TestBed.configureTestingModule({ imports: [FilePane] });
    const fixture = TestBed.createComponent(FilePane);
    const sorted: Array<string> = [];
    fixture.componentInstance.sorted.subscribe((value) => sorted.push(value));
    fixture.componentRef.setInput('contentUrl', (id: string) => id);
    fixture.componentRef.setInput(
      'listing',
      new Listing({ files: [], folder: '', folders: [], source: 'r2', truncated: false }),
    );
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('This folder is empty.');
    const select = fixture.nativeElement.querySelector('select') as HTMLSelectElement;
    select.value = 'created-desc';
    select.dispatchEvent(new Event('change'));
    expect(sorted).toEqual(['created-desc']);
  });
});
