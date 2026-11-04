import { TestBed } from '@angular/core/testing';
import { DriveShell } from './drive-shell';
import { driveProviders } from '../../../testing/runtime';

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
    expect(fixture.nativeElement.textContent).toContain('Log out');
  });
});
