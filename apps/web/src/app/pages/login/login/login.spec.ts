import { TestBed } from '@angular/core/testing';
import { Login } from './login';
import { driveProviders } from '../../../../testing/runtime';

describe('Login', () => {
  // The password form is the whole login screen.
  it('asks for a password', () => {
    TestBed.configureTestingModule({
      imports: [Login],
      providers: driveProviders(),
    });
    const fixture = TestBed.createComponent(Login);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Log in to Private Drive');
    expect(fixture.nativeElement.querySelector('input[type="password"]')).not.toBeNull();
  });
});
