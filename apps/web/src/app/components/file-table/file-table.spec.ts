import { TestBed } from '@angular/core/testing';
import { FileEntry } from '@private-drive/domain';

import { FileTable } from './file-table';

const entry = (name: string, contentType: string, image: boolean): FileEntry =>
	new FileEntry({
		contentType,
		createdAt: '2026-01-01T00:00:00.000Z',
		folder: '',
		id: '1',
		image,
		name,
		size: 1536,
		source: 'r2',
	});

const notes = entry('notes.txt', 'text/plain', false);
const photo = entry('photo.jpg', 'image/jpeg', true);
const clip = entry('clip.mp4', 'video/mp4', false);

describe('FileTable', () => {
	// Virtual rows need a real viewport height, so the preview output is checked on the component.
	it('previews an image and leaves other files closed', () => {
		TestBed.configureTestingModule({ imports: [FileTable] });
		const fixture = TestBed.createComponent(FileTable);
		const previewed: Array<string> = [];
		fixture.componentInstance.previewed.subscribe((file) => previewed.push(file.name));
		fixture.componentRef.setInput('files', [notes]);
		fixture.detectChanges();
		expect(fixture.nativeElement.textContent).toContain('Name');
		expect(fixture.componentInstance.files()[0]?.name).toBe('notes.txt');
		const preview = (file: FileEntry): void => {
			(fixture.componentInstance as unknown as { preview: (file: FileEntry) => void }).preview(
				file,
			);
		};
		preview(notes);
		preview(clip);
		preview(photo);
		expect(previewed).toEqual(['photo.jpg']);
	});
});
