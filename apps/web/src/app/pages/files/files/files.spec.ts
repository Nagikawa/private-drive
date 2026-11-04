import { TestBed } from '@angular/core/testing';
import { Files } from './files';
import { driveProviders } from '../../../../testing/runtime';

describe('Files', () => {
  // The page starts on an empty pane until a listing arrives.
  it('renders the file pane', () => {
    TestBed.configureTestingModule({
      imports: [Files],
      providers: driveProviders(),
    });
    const fixture = TestBed.createComponent(Files);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('input[placeholder="Search files..."]')).not.toBeNull();
  });
});
