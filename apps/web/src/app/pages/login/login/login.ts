import { Component, inject, signal } from '@angular/core';
import { form, FormField, required, submit } from '@angular/forms/signals';
import { Router } from '@angular/router';
import { Effect } from 'effect';
import { SessionFailure } from '../../../core/drive-error';
import { DriveApi } from '../../../services/drive-api/drive-api.service';
import { DriveRuntime } from '../../../services/drive-runtime/drive-runtime.service';

@Component({
  selector: 'app-login',
  imports: [FormField],
  templateUrl: './login.html',
  host: { class: 'block h-full overflow-auto' },
})
export class Login {
  private readonly api = inject(DriveApi);
  private readonly runtime = inject(DriveRuntime);
  private readonly router = inject(Router);
  private readonly model = signal({ password: '' });
  // Requires a password before the login request is sent.
  protected readonly loginForm = form(this.model, (path) => {
    required(path.password, { message: 'Enter a password' });
  });
  protected readonly errorMessage = signal('');
  protected readonly submitting = signal(false);

  // Validates the form, stores the session cookie, and opens the drive.
  protected onSubmit(event: Event): void {
    event.preventDefault();
    this.errorMessage.set('');
    this.submitting.set(true);
    const password = this.model().password;
    const loginForm = this.loginForm;
    const api = this.api;
    const router = this.router;
    const setError = (message: string) => this.errorMessage.set(message);
    const setBusy = (value: boolean) => this.submitting.set(value);
    const program = Effect.gen(function* () {
      const accepted = yield* Effect.tryPromise({
        try: () => submit(loginForm, async () => undefined),
        catch: () => new SessionFailure({ message: 'Login failed' }),
      });
      if (!accepted) {
        return;
      }
      yield* api.login(password);
      yield* Effect.tryPromise({
        try: () => router.navigateByUrl('/files'),
        catch: () => new SessionFailure({ message: 'Could not open the drive' }),
      });
    }).pipe(
      Effect.catch((error) => Effect.sync(() => setError(error.message))),
      Effect.ensuring(Effect.sync(() => setBusy(false))),
      Effect.asVoid,
    );
    this.runtime.settle(program);
  }
}
