import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import * as Exit from 'effect/Exit';

import { driveProviders } from '../../testing/runtime';
import { DriveRuntime } from '../services/drive-runtime/drive-runtime.service';
import { authGuard, guestGuard } from './auth-guard';

describe('auth guards', () => {
	// A failed session sends the visitor to login. A live session sends them to the files.
	it('redirects from the result of the current session', async () => {
		TestBed.configureTestingModule({ providers: driveProviders() });
		const runtime = TestBed.inject(DriveRuntime);
		const loggedOut = await TestBed.runInInjectionContext(() =>
			authGuard({} as never, {} as never),
		);
		expect(loggedOut).toBeInstanceOf(UrlTree);
		expect(TestBed.inject(Router).serializeUrl(loggedOut as UrlTree)).toBe('/login');

		vi.spyOn(runtime, 'run').mockResolvedValue(Exit.succeed(true) as never);
		const allowed = await TestBed.runInInjectionContext(() => authGuard({} as never, {} as never));
		expect(allowed).toBe(true);
		const guest = await TestBed.runInInjectionContext(() => guestGuard({} as never, {} as never));
		expect(TestBed.inject(Router).serializeUrl(guest as UrlTree)).toBe('/files');
	});
});
