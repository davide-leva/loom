import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from './auth.service';

export const authFailureInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const authorization = request.headers.get('Authorization');

  return next(request).pipe(catchError((error: unknown) => {
    // Ignore a late response from a previous session after another login.
    if (error instanceof HttpErrorResponse && error.status === 401 && authorization
        && authorization === auth.authHeaders().get('Authorization')) {
      auth.logout();
      void router.navigateByUrl('/login');
    }
    return throwError(() => error);
  }));
};
