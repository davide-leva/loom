import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { AuthService } from './auth.service';
import type { CurrentUser, LoginResponse } from '../../shared/models/auth.types';

describe('AuthService', () => {
  let service: AuthService;
  let http: HttpTestingController;

  const user: CurrentUser = {
    id: 1,
    username: 'mario',
    role: 'ADMIN',
    fullName: 'Mario Rossi',
    primaryColor: 'blue'
  };

  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });
    service = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    sessionStorage.clear();
  });

  it('login() persists token, fetches /me and exposes the user', () => {
    let resolved: CurrentUser | undefined;
    service.login('  mario ', 'secret').subscribe(user => { resolved = user; });

    const loginReq = http.expectOne('/api/auth/login');
    expect(loginReq.request.method).toBe('POST');
    expect(loginReq.request.body).toEqual({ username: 'mario', password: 'secret' });
    const loginResponse: LoginResponse = { accessToken: 'token-abc', tokenType: 'Bearer' };
    loginReq.flush(loginResponse);

    expect(sessionStorage.getItem('loom-access-token')).toBe('token-abc');

    const meReq = http.expectOne('/api/auth/me');
    expect(meReq.request.headers.get('Authorization')).toBe('Bearer token-abc');
    meReq.flush(user);

    expect(resolved).toEqual(user);
    expect(service.user()).toEqual(user);
  });

  it('login() clears the session on failure', () => {
    service.login('mario', 'bad').subscribe({ error: () => undefined });
    const req = http.expectOne('/api/auth/login');
    req.flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });
    expect(sessionStorage.getItem('loom-access-token')).toBeNull();
    expect(service.user()).toBeNull();
  });

  it('logout() clears storage and resets the user signal', () => {
    sessionStorage.setItem('loom-access-token', 'token-abc');
    service.user.set(user);
    service.logout();
    expect(sessionStorage.getItem('loom-access-token')).toBeNull();
    expect(service.user()).toBeNull();
  });

  it('me() returns error when no token is in storage', () => {
    let error: Error | undefined;
    service.me().subscribe({ next: () => undefined, error: err => { error = err; } });
    expect(error?.message).toBe('Nessuna sessione attiva');
  });

  it('hasValidSession() resolves true on success', () => {
    sessionStorage.setItem('loom-access-token', 'token-abc');
    let result: boolean | undefined;
    service.hasValidSession().subscribe(value => { result = value; });
    http.expectOne('/api/auth/me').flush(user);
    expect(result).toBe(true);
  });

  it('hasValidSession() logs out on 401', () => {
    sessionStorage.setItem('loom-access-token', 'token-abc');
    service.user.set(user);
    let result: boolean | undefined;
    service.hasValidSession().subscribe(value => { result = value; });
    http.expectOne('/api/auth/me')
      .flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });
    expect(result).toBe(false);
    expect(sessionStorage.getItem('loom-access-token')).toBeNull();
    expect(service.user()).toBeNull();
  });

  it('authHeaders() returns bearer header when token present, empty otherwise', () => {
    expect(service.authHeaders().get('Authorization')).toBeNull();
    sessionStorage.setItem('loom-access-token', 'token-abc');
    expect(service.authHeaders().get('Authorization')).toBe('Bearer token-abc');
  });

  it('hasUsableSession() checks JWT exp when present', () => {
    const validToken = jwtWithExp(Math.floor(Date.now() / 1000) + 120);
    sessionStorage.setItem('loom-access-token', validToken);
    expect(service.hasUsableSession(30)).toBe(true);
    expect(service.hasUsableSession(180)).toBe(false);
  });

  it('hasUsableSession() treats legacy non-JWT tokens as usable when present', () => {
    sessionStorage.setItem('loom-access-token', 'token-abc');
    expect(service.hasUsableSession(30)).toBe(true);
  });
});

function jwtWithExp(exp: number): string {
  const payload = btoa(JSON.stringify({ exp })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `header.${payload}.signature`;
}
