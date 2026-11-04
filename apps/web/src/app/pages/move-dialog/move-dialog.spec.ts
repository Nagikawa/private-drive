import { TestBed } from '@angular/core/testing';
import { MoveDialog } from './move-dialog';
import { driveProviders } from '../../../testing/runtime';

describe('MoveDialog', () => {
  // The destination starts at Root before a folder is chosen.
  it('describes the move from Root', () => {
    TestBed.configureTestingModule({
      imports: [MoveDialog],
      providers: driveProviders(),
    });
    const fixture = TestBed.createComponent(MoveDialog);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Move to folder');
    expect(fixture.nativeElement.textContent).toContain('Root');
  });
});
