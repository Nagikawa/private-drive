import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';

import { DriveApi } from '../services/drive-api/drive-api.service';
import { DriveRuntime } from '../services/drive-runtime/drive-runtime.service';

// Allows the drive only when the session cookie still resolves to an account.
export const authGuard: CanActivateFn = () => {
	const api = inject(DriveApi);
	const runtime = inject(DriveRuntime);
	const router = inject(Router);
	return runtime
		.run(api.current().pipe(Effect.as(true)))
		.then((exit) => (Exit.isSuccess(exit) ? true : router.createUrlTree(['/login'])));
};

// Sends an already signed-in visitor away from the login page.
export const guestGuard: CanActivateFn = () => {
	const api = inject(DriveApi);
	const runtime = inject(DriveRuntime);
	const router = inject(Router);
	return runtime
		.run(api.current())
		.then((exit) => (Exit.isSuccess(exit) ? router.createUrlTree(['/files']) : true));
};
