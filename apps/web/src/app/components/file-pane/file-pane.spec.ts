import { CdkVirtualScrollViewport } from '@angular/cdk/scrolling';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { FileEntry, Listing } from '@private-drive/domain';

import { FilePane } from './file-pane';

const entry = (name: string, contentType: string, image: boolean, id = '1'): FileEntry =>
	new FileEntry({
		contentType,
		createdAt: '2026-01-01T00:00:00.000Z',
		folder: '',
		id,
		image,
		name,
		size: 10,
		source: 'r2',
	});

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

	// Telegram keeps upload and a real chat link. Search, delete, folders, sort, and view stay off.
	it('shows upload and the chat link without search', () => {
		TestBed.configureTestingModule({ imports: [FilePane] });
		const fixture = TestBed.createComponent(FilePane);
		fixture.componentRef.setInput('contentUrl', (id: string) => id);
		fixture.componentRef.setInput('source', 'telegram');
		fixture.componentRef.setInput('chatUrl', 'https://t.me/c/1234567890');
		fixture.componentRef.setInput(
			'listing',
			new Listing({ files: [], folder: '', folders: [], source: 'telegram', truncated: false }),
		);
		fixture.detectChanges();
		const link = fixture.nativeElement.querySelector('a') as HTMLAnchorElement;
		expect(fixture.nativeElement.querySelector('input[placeholder="Search files..."]')).toBeNull();
		expect(fixture.nativeElement.querySelector('[aria-label="Delete selected"]')).toBeNull();
		expect(fixture.nativeElement.querySelector('[aria-label="New folder"]')).toBeNull();
		expect(fixture.nativeElement.querySelector('select')).toBeNull();
		expect(fixture.nativeElement.querySelector('[aria-label="Grid"]')).toBeNull();
		expect(fixture.nativeElement.querySelector('[aria-label="List"]')).toBeNull();
		expect(fixture.nativeElement.querySelector('[aria-label="Upload files"]')).not.toBeNull();
		expect(link.textContent).toContain('View uploaded files');
		expect(link.getAttribute('href')).toBe('https://t.me/c/1234567890');
		expect(fixture.nativeElement.textContent).toContain('Telegram does not keep a file list.');
	});

	// The grid opens the preview dialog for images only. A video keeps its card.
	it('emits a preview only for an image', () => {
		TestBed.configureTestingModule({ imports: [FilePane] });
		const fixture = TestBed.createComponent(FilePane);
		fixture.componentRef.setInput('contentUrl', (id: string) => id);
		const previewed: Array<string> = [];
		fixture.componentInstance.previewed.subscribe((file) => previewed.push(file.name));
		fixture.detectChanges();
		const preview = (file: FileEntry): void => {
			(fixture.componentInstance as unknown as { preview: (file: FileEntry) => void }).preview(
				file,
			);
		};
		preview(entry('clip.mp4', 'video/mp4', false));
		preview(entry('notes.txt', 'text/plain', false));
		preview(entry('photo.jpg', 'image/jpeg', true));
		expect(previewed).toEqual(['photo.jpg']);
	});

	// A non-image fills the figure with its suffix. An image keeps the preview image.
	it('renders the extension in the figure and leaves an image preview in place', async () => {
		if (typeof ResizeObserver === 'undefined') {
			vi.stubGlobal(
				'ResizeObserver',
				class {
					observe(): void {}
					unobserve(): void {}
					disconnect(): void {}
				},
			);
		}
		TestBed.configureTestingModule({ imports: [FilePane] });
		const fixture = TestBed.createComponent(FilePane);
		fixture.componentRef.setInput('contentUrl', (id: string) => `/api/files/${id}/content`);
		fixture.componentRef.setInput(
			'listing',
			new Listing({
				files: [
					entry('notes.pdf', 'application/pdf', false, 'pdf'),
					entry('photo.jpg', 'image/jpeg', true, 'photo'),
				],
				folder: '',
				folders: [],
				source: 'r2',
				truncated: false,
			}),
		);
		fixture.detectChanges();
		const viewport = fixture.nativeElement.querySelector('.file-grid') as HTMLElement;
		Object.defineProperty(viewport, 'clientHeight', { configurable: true, value: 480 });
		Object.defineProperty(viewport, 'clientWidth', { configurable: true, value: 240 });
		const scroller = fixture.debugElement.query(By.directive(CdkVirtualScrollViewport))
			.componentInstance as CdkVirtualScrollViewport;
		scroller.checkViewportSize();
		await vi.waitFor(() => {
			fixture.detectChanges();
			expect(fixture.nativeElement.querySelectorAll('figure').length).toBe(2);
		});
		const figures = [...fixture.nativeElement.querySelectorAll('figure')] as Array<HTMLElement>;
		const pdf = figures.find((figure) => figure.textContent?.includes('PDF'));
		const photo = figures.find((figure) => figure.querySelector('img') !== null);
		expect(pdf?.textContent?.trim()).toBe('PDF');
		expect(pdf?.querySelector('img')).toBeNull();
		expect(photo?.querySelector('img')?.getAttribute('src')).toBe('/api/files/photo/content');
		expect(photo?.querySelector('img')?.getAttribute('alt')).toBe('photo.jpg');
		expect(photo?.textContent?.trim()).toBe('');
		expect(fixture.nativeElement.textContent).toContain('notes.pdf');
		expect(fixture.nativeElement.querySelector('[aria-label="Select notes.pdf"]')).not.toBeNull();
	});
});
