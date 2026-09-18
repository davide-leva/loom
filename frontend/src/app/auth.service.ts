import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, catchError, map, of, switchMap, tap, throwError } from 'rxjs';

interface LoginResponse {
  accessToken: string;
  tokenType: string;
  expiresInSeconds: number;
}

export interface CurrentUser {
  id: number;
  username: string;
  email: string;
  role: string;
  companyName: string | null;
}

export interface ProjectSummary {
  id: number;
  name: string;
}

const TOKEN_KEY = 'sf2-tickets-access-token';

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

  me(): Observable<CurrentUser> {
    const token = sessionStorage.getItem(TOKEN_KEY);
    if (!token) {
      return throwError(() => new Error('Nessuna sessione attiva'));
    }
    return this.http.get<CurrentUser>('/api/auth/me', {
      headers: this.headers(token)
    }).pipe(tap(user => this.user.set(user)));
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
    if (this.user()) {
      return of(true);
    }
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
  }
}
