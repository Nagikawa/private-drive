import { TestBed } from '@angular/core/testing';

import { VideoFrame, captureVideoFrame } from './video-frame';

interface FakeVideo {
	muted: boolean;
	preload: string;
	playsInline: boolean;
	videoWidth: number;
	videoHeight: number;
	duration: number;
	currentTime: number;
	src: string;
}

// Stands in for a video element so the test does not need a decoder.
function installVideo(fail: boolean): FakeVideo {
	const listeners = new Map<string, EventListener>();
	const video: FakeVideo = {
		muted: false,
		preload: '',
		playsInline: false,
		videoWidth: 32,
		videoHeight: 18,
		duration: 5,
		currentTime: 0,
		src: '',
	};
	const element = {
		...video,
		pause(): void {},
		load(): void {},
		removeAttribute(): void {},
		addEventListener(type: string, listener: EventListener): void {
			listeners.set(type, listener);
		},
		removeEventListener(type: string): void {
			listeners.delete(type);
		},
		set src(value: string) {
			video.src = value;
			queueMicrotask(() => {
				const type = fail ? 'error' : 'loadedmetadata';
				listeners.get(type)?.(new Event(type));
			});
		},
		get src(): string {
			return video.src;
		},
		set currentTime(value: number) {
			video.currentTime = value;
			queueMicrotask(() => listeners.get('seeked')?.(new Event('seeked')));
		},
		get currentTime(): number {
			return video.currentTime;
		},
		get muted(): boolean {
			return video.muted;
		},
		set muted(value: boolean) {
			video.muted = value;
		},
		get preload(): string {
			return video.preload;
		},
		set preload(value: string) {
			video.preload = value;
		},
		get playsInline(): boolean {
			return video.playsInline;
		},
		set playsInline(value: boolean) {
			video.playsInline = value;
		},
		get videoWidth(): number {
			return video.videoWidth;
		},
		get videoHeight(): number {
			return video.videoHeight;
		},
		get duration(): number {
			return video.duration;
		},
	};
	const canvas = {
		width: 0,
		height: 0,
		getContext(): { drawImage: () => void } {
			return { drawImage(): void {} };
		},
		toBlob(callback: (blob: Blob | null) => void): void {
			callback(new Blob(['frame'], { type: 'image/jpeg' }));
		},
	};
	const create = document.createElement.bind(document);
	vi.spyOn(document, 'createElement').mockImplementation(((
		tag: string,
		options?: ElementCreationOptions,
	) => {
		if (tag === 'video') {
			return element as unknown as HTMLElement;
		}
		if (tag === 'canvas') {
			return canvas as unknown as HTMLElement;
		}
		return create(tag, options);
	}) as typeof document.createElement);
	vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:frame');
	vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
	return video;
}

describe('captureVideoFrame', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	// A short seek is what makes the browser decode a frame from metadata.
	it('draws the frame after seeking just past the start', async () => {
		const video = installVideo(false);
		await expect(captureVideoFrame('/api/files/1/content')).resolves.toBe('blob:frame');
		expect(video.muted).toBe(true);
		expect(video.preload).toBe('metadata');
		expect(video.currentTime).toBeCloseTo(0.1);
		expect(video.src).toBe('/api/files/1/content');
	});

	// A decode error leaves the caller with no image, which is the card placeholder.
	it('rejects when the video cannot be decoded', async () => {
		installVideo(true);
		await expect(captureVideoFrame('/api/files/1/content')).rejects.toThrow(
			'Could not capture a video frame',
		);
	});
});

describe('VideoFrame', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	// The card keeps the blob only while the thumbnail is on screen.
	it('shows the captured frame and revokes it when destroyed', async () => {
		installVideo(false);
		const fixture = TestBed.createComponent(VideoFrame);
		fixture.componentRef.setInput('url', '/api/files/1/content');
		fixture.componentRef.setInput('name', 'clip.mp4');
		fixture.componentRef.setInput('mark', 'MP4');
		fixture.detectChanges();
		await vi.waitFor(() => {
			fixture.detectChanges();
			expect(fixture.nativeElement.querySelector('img')).not.toBeNull();
		});
		const image = fixture.nativeElement.querySelector('img') as HTMLImageElement;
		expect(image.getAttribute('src')).toBe('blob:frame');
		expect(image.getAttribute('alt')).toBe('clip.mp4');
		expect(fixture.nativeElement.textContent).not.toContain('MP4');
		fixture.destroy();
		expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:frame');
	});

	// Until a frame exists, the card figure shows the suffix instead of a blank area.
	it('shows the extension when no frame is captured', async () => {
		installVideo(true);
		const fixture = TestBed.createComponent(VideoFrame);
		fixture.componentRef.setInput('url', '/api/files/1/content');
		fixture.componentRef.setInput('name', 'clip.mp4');
		fixture.componentRef.setInput('mark', 'MP4');
		fixture.detectChanges();
		await vi.waitFor(() => {
			fixture.detectChanges();
			expect(fixture.nativeElement.querySelector('img')).toBeNull();
		});
		expect(fixture.nativeElement.textContent?.trim()).toBe('MP4');
	});
});
