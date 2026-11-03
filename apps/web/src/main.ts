import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

bootstrapApplication(App, appConfig)
  // Surfaces a startup failure in the console when the browser cannot boot the app.
  .catch((err) => console.error(err));
