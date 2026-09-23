import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, catchError, map, of, switchMap, tap, throwError } from 'rxjs';
import { applyBrandColor } from '../../shared/brand-colors';
import type { CurrentUser, ExternalLoginResponse, LoginResponse, ProjectSummary } from '../../shared/models/auth.types';

export type { CurrentUser, ProjectSummary };

const TOKEN_KEY = 'loom-access-token';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  readonly user = signal<CurrentUser | null>(null);

  login(username: string, password: string): Observable<CurrentUser> {
    return this.http.post<LoginResponse>('/api/auth/login', { username: username.trim(), password }).pipe(
      tap(response => sessionStorage.setItem(TOKEN_KEY, response.accessToken)),
      switchMap(() => this.me()),
      catchError(error => {
        this.logout();
        return throwError(() => error);
      })
    );
  }

  loginExternal(token: string): Observable<number> {
    return this.http.post<ExternalLoginResponse>('/api/auth/external-login', { token }).pipe(
      tap(response => sessionStorage.setItem(TOKEN_KEY, response.session.accessToken)),
      switchMap(response => this.me().pipe(map(() => response.projectId))),
      catchError(error => {
        this.logout();
        return throwError(() => error);
      })
    );
  }

  me(): Observable<CurrentUser> {
    const token = sessionStorage.getItem(TOKEN_KEY);
    if (!token) {
      return throwError(() => new Error('Nessuna sessione attiva'));
    }
    return this.http.get<CurrentUser>('/api/auth/me', {
      headers: this.headers(token)
    }).pipe(tap(user => {
      this.user.set(user);
      applyBrandColor(user.primaryColor);
    }));
  }

  projects(): Observable<ProjectSummary[]> {
    const token = sessionStorage.getItem(TOKEN_KEY);
    if (!token) {
      return throwError(() => new Error('Nessuna sessione attiva'));
    }
    return this.http.get<ProjectSummary[]>('/api/auth/projects', { headers: this.headers(token) });
  }

  authHeaders(): HttpHeaders {
    const token = sessionStorage.getItem(TOKEN_KEY);
    return token ? this.headers(token) : new HttpHeaders();
  }

  private headers(token: string): HttpHeaders {
    return new HttpHeaders({ Authorization: `Bearer ${token}` });
  }

  hasValidSession(): Observable<boolean> {
    return this.me().pipe(
      map(() => true),
      catchError((error: unknown) => {
        if (error instanceof HttpErrorResponse && error.status !== 401 && error.status !== 403) {
          return of(false);
        }
        this.logout();
        return of(false);
      })
    );
  }

  logout(): void {
    sessionStorage.removeItem(TOKEN_KEY);
    this.user.set(null);
    applyBrandColor('blue');
  }
}