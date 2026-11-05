import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/auth-guard';

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [guestGuard],
    // Loads the login screen only when that route is opened.
    loadComponent: () => import('./pages/login/login/login').then((module) => module.Login),
  },
  {
    path: '',
    canActivate: [authGuard],
    // Loads the shell once, then shows the file browser inside it.
    loadComponent: () =>
      import('./shell/drive-shell/drive-shell').then((module) => module.DriveShell),
    children: [
      {
        path: '',
        pathMatch: 'full',
        // Home opens the file browser. Files is the only main page.
        redirectTo: 'files',
      },
      {
        path: 'files',
        loadComponent: () => import('./pages/files/files/files').then((module) => module.Files),
      },
    ],
  },
];
