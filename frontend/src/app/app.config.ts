import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideRouter } from '@angular/router';
import { providePrimeNG } from 'primeng/config';
import { routes } from './app.routes';
import { authFailureInterceptor } from './auth-failure.interceptor';
import { theme } from './app.theme';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideHttpClient(withInterceptors([authFailureInterceptor])),
    provideAnimationsAsync(),
    providePrimeNG({ theme: { preset: theme, options: { darkModeSelector: '' } } })
  ]
};
