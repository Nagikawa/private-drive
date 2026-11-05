import { Component, OnDestroy, effect, input, signal } from '@angular/core';

const seekSeconds = 0.1;

// Draws one decoded video frame to a blob URL. The caller revokes that URL.
export function captureVideoFrame(url: string): Promise<string> {
	return new Promise((resolve, reject) => {
		const video = document.createElement('video');
		video.muted = true;
		video.preload = 'metadata';
		video.playsInline = true;

		let settled = false;
		let released = false;
		const timer = window.setTimeout(() => fail(), 8_000);

		// Drops the media element once the frame is drawn or the attempt is abandoned.
		function release(): void {
			if (released) {
				return;
			}
			released = true;
			window.clearTimeout(timer);
			video.removeEventListener('error', fail);
			video.removeEventListener('loadedmetadata', onMetadata);
			video.removeEventListener('seeked', onSeeked);
			video.pause();
			video.removeAttribute('src');
			video.load();
		}

		function fail(): void {
			if (settled) {
				return;
			}
			settled = true;
			release();
			reject(new Error('Could not capture a video frame'));
		}

		function succeed(objectUrl: string): void {
			if (settled) {
				URL.revokeObjectURL(objectUrl);
				return;
			}
			settled = true;
			release();
			resolve(objectUrl);
		}

		// The metadata seek forces the browser to decode a frame near the start.
		function onSeeked(): void {
			const width = video.videoWidth;
			const height = video.videoHeight;
			if (width === 0 || height === 0) {
				fail();
				return;
			}
			const canvas = document.createElement('canvas');
			canvas.width = width;
			canvas.height = height;
			const context = canvas.getContext('2d');
			if (context === null) {
				fail();
				return;
			}
			try {
				context.drawImage(video, 0, 0, width, height);
			} catch {
				fail();
				return;
			}
			release();
			canvas.toBlob((blob) => {
				if (blob === null) {
					fail();
					return;
				}
				succeed(URL.createObjectURL(blob));
			}, 'image/jpeg');
		}

		function onMetadata(): void {
			const duration = video.duration;
			const time =
				Number.isFinite(duration) && duration > 0
					? Math.min(seekSeconds, duration / 2)
					: seekSeconds;
			video.addEventListener('seeked', onSeeked, { once: true });
			try {
				video.currentTime = time;
			} catch {
				fail();
			}
		}

		video.addEventListener('error', fail, { once: true });
		video.addEventListener('loadedmetadata', onMetadata, { once: true });
		video.src = url;
	});
}

@Component({
	selector: 'app-video-frame',
	host: { class: 'flex h-full min-h-0 w-full items-center justify-center' },
	template: `
		@if (frame(); as src) {
			<img class="h-full w-full object-contain" draggable="false" [src]="src" [alt]="name()" />
		} @else if (mark(); as label) {
			<span
				aria-hidden="true"
				class="pointer-events-none max-w-full min-w-0 truncate px-3 text-center text-5xl leading-none font-semibold tracking-widest select-none"
				>{{ label }}</span
			>
		}
	`,
})
export class VideoFrame implements OnDestroy {
	readonly url = input.required<string>();
	readonly name = input('');
	readonly mark = input('');
	protected readonly frame = signal<string | null>(null);
	private objectUrl: string | null = null;
	private alive = true;

	constructor() {
		// Replaces the frame when the content URL changes and drops it when the card leaves the grid.
		effect((onCleanup) => {
			const url = this.url();
			let current = true;
			onCleanup(() => {
				current = false;
				this.dropFrame();
			});
			void captureVideoFrame(url).then(
				(objectUrl) => {
					if (!current || !this.alive) {
						URL.revokeObjectURL(objectUrl);
						return;
					}
					this.dropFrame();
					this.objectUrl = objectUrl;
					this.frame.set(objectUrl);
				},
				() => {
					if (current && this.alive) {
						this.dropFrame();
					}
				},
			);
		});
	}

	ngOnDestroy(): void {
		this.alive = false;
		this.dropFrame();
	}

	// Revokes the blob URL so a scrolled-away card does not keep the frame.
	private dropFrame(): void {
		const objectUrl = this.objectUrl;
		this.objectUrl = null;
		if (objectUrl !== null) {
			URL.revokeObjectURL(objectUrl);
		}
		if (this.alive && this.frame() !== null) {
			this.frame.set(null);
		}
	}
}
