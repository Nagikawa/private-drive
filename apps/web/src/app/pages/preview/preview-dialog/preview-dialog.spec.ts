import { TestBed } from '@angular/core/testing';
import { FileEntry } from '@private-drive/model';

import { driveProviders } from '../../../../testing/runtime';
import { PreviewDialog } from './preview-dialog';

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

	// Videos and other files do not open the image preview.
	it('stays closed for a video and for other files', () => {
		let opened = false;
		HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
			opened = true;
			this.open = true;
		};
		TestBed.configureTestingModule({
			imports: [PreviewDialog],
			providers: driveProviders(),
		});
		const fixture = TestBed.createComponent(PreviewDialog);
		fixture.detectChanges();
		const open = (name: string, contentType: string): void => {
			fixture.componentInstance.open(
				new FileEntry({
					contentType,
					createdAt: '2026-01-01T00:00:00.000Z',
					folder: '',
					id: '2',
					image: false,
					name,
					size: 10,
					source: 'r2',
				}),
			);
		};
		open('clip.mp4', 'video/mp4');
		open('notes.txt', 'text/plain');
		fixture.detectChanges();
		expect(opened).toBe(false);
		expect(fixture.nativeElement.querySelector('video')).toBeNull();
		expect(fixture.nativeElement.querySelector('img')).toBeNull();
		expect(fixture.nativeElement.textContent).not.toContain('clip.mp4');
	});
});
