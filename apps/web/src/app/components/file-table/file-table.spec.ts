import { TestBed } from '@angular/core/testing';
import { FileEntry } from '@private-drive/domain';
import { FileTable } from './file-table';

const notes = new FileEntry({
  contentType: 'text/plain',
  createdAt: '2026-01-01T00:00:00.000Z',
  folder: '',
  id: '1',
  image: false,
  name: 'notes.txt',
  size: 1536,
  source: 'r2',
});

describe('FileTable', () => {
  // Virtual rows need a real viewport height, so the preview output is checked on the component.
  it('keeps the file and emits a preview', () => {
    TestBed.configureTestingModule({ imports: [FileTable] });
    const fixture = TestBed.createComponent(FileTable);
    const previewed: Array<string> = [];
    fixture.componentInstance.previewed.subscribe((file) => previewed.push(file.name));
    fixture.componentRef.setInput('files', [notes]);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Name');
    expect(fixture.componentInstance.files()[0]?.name).toBe('notes.txt');
    (fixture.componentInstance as unknown as { preview: (file: FileEntry) => void }).preview(notes);
    expect(previewed).toEqual(['notes.txt']);
  });
});
