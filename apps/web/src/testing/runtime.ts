import { provideZonelessChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { Exit } from 'effect';
import { EMPTY } from 'rxjs';
import { Unauthorized } from '@private-drive/domain';
import { DriveApi } from '../app/services/drive-api/drive-api.service';
import { DriveRuntime } from '../app/services/drive-runtime/drive-runtime.service';

// Listing and tree requests stay idle so a component test does not call the API.
export const quietRuntime = {
  bind: () => EMPTY,
  run: () => Promise.resolve(Exit.fail(new Unauthorized({ message: 'Log in first' }))),
  settle: () => undefined,
};

export const driveProviders = () => [
  provideZonelessChangeDetection(),
  provideRouter([]),
  DriveApi,
  { provide: DriveRuntime, useValue: quietRuntime },
];
