import { TestBed } from '@angular/core/testing';

import { driveProviders } from '../../../testing/runtime';
import { DriveShell } from './drive-shell';

describe('DriveShell', () => {
	// The shell keeps logout at the end of the bar.
	it('shows the drive title and logout', () => {
		TestBed.configureTestingModule({
			imports: [DriveShell],
			providers: driveProviders(),
		});
		const fixture = TestBed.createComponent(DriveShell);
		fixture.detectChanges();
		expect(fixture.nativeElement.textContent).toContain('Private Drive');
		expect(
			fixture.nativeElement.querySelector('button[aria-label="Log out"]'),
		).not.toBeNull();
	});
});
