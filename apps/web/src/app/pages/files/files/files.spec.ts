import { TestBed } from '@angular/core/testing';
import { Listing, SourceStatus } from '@private-drive/model';
import * as Effect from 'effect/Effect';
import { of } from 'rxjs';

import { driveProviders } from '../../../../testing/runtime';
import { DriveApi } from '../../../services/drive-api/drive-api.service';
import { DriveRuntime } from '../../../services/drive-runtime/drive-runtime.service';
import { Workspace } from '../../../services/workspace/workspace.service';
import { Files } from './files';

const chat = 'https://t.me/c/1234567890';

describe('Files', () => {
	// The page starts on an empty pane until a listing arrives.
	it('renders the file pane', () => {
		TestBed.configureTestingModule({
			imports: [Files],
			providers: driveProviders(),
		});
		const workspace = TestBed.inject(Workspace);
		workspace.source.set('r2');
		const fixture = TestBed.createComponent(Files);
		fixture.detectChanges();
		expect(
			fixture.nativeElement.querySelector('input[placeholder="Search files..."]'),
		).not.toBeNull();
	});

	// Telegram hides search and the folder tools, and links to the chat the API returned.
	it('shows upload and the view-files link without search', () => {
		TestBed.configureTestingModule({
			imports: [Files],
			providers: [
				...driveProviders(),
				{
					provide: DriveApi,
					useValue: {
						contentUrl: (id: string) => id,
						list: () =>
							Effect.succeed(
								new Listing({
									files: [],
									folder: '',
									folders: [],
									source: 'telegram',
									truncated: false,
								}),
							),
						sources: () =>
							Effect.succeed([
								new SourceStatus({
									connected: true,
									detail: 'Connected @bot',
									id: 'telegram',
									label: 'Telegram',
									url: chat,
								}),
							]),
						uploadSessions: () => Effect.succeed([]),
					} as unknown as DriveApi,
				},
				{
					provide: DriveRuntime,
					useValue: {
						bind: (effect: Effect.Effect<unknown, never, never>) => of(Effect.runSync(effect)),
						run: () => Promise.resolve(),
						settle: () => undefined,
					} as unknown as DriveRuntime,
				},
			],
		});
		const workspace = TestBed.inject(Workspace);
		workspace.source.set('telegram');
		const fixture = TestBed.createComponent(Files);
		fixture.detectChanges();
		const link = fixture.nativeElement.querySelector('a') as HTMLAnchorElement;
		expect(fixture.nativeElement.querySelector('input[placeholder="Search files..."]')).toBeNull();
		expect(fixture.nativeElement.querySelector('[aria-label="Upload files"]')).not.toBeNull();
		expect(link.textContent).toContain('View uploaded files');
		expect(link.getAttribute('href')).toBe(chat);
	});
});
