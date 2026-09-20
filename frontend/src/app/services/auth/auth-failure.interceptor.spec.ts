import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { Router, provideRouter } from '@angular/router';
import { authFailureInterceptor } from './auth-failure.interceptor';
import { AuthService } from './auth.service';

describe('authFailureInterceptor', () => {
  let http: HttpTestingController;
  let httpClient: HttpClient;
  let auth: AuthService;
  let router: Router;

  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([authFailureInterceptor])),
        provideHttpClientTesting()
      ]
    });
    http = TestBed.inject(HttpTestingController);
    httpClient = TestBed.inject(HttpClient);
    auth = TestBed.inject(AuthService);
    router = TestBed.inject(Router);
  });

  afterEach(() => {
    http.verify();
    sessionStorage.clear();
  });

  it('logs out and redirects when 401 arrives with matching Authorization header', () => {
    const logoutSpy = jest.spyOn(auth, 'logout');
    const navigateSpy = jest.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    sessionStorage.setItem('sf2-tickets-access-token', 'token-1');
    httpClient.get('/api/things', { headers: auth.authHeaders() }).subscribe({ error: () => undefined });
    http.expectOne('/api/things')
      .flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });
    expect(logoutSpy).toHaveBeenCalled();
    expect(navigateSpy).toHaveBeenCalledWith('/login');
  });

  it('does not trigger logout when 401 has no Authorization header', () => {
    const logoutSpy = jest.spyOn(auth, 'logout');
    const navigateSpy = jest.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    httpClient.get('/api/things').subscribe({ error: () => undefined });
    http.expectOne('/api/things')
      .flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });
    expect(logoutSpy).not.toHaveBeenCalled();
    expect(navigateSpy).not.toHaveBeenCalled();
  });

  it('does not trigger logout when 401 has stale Authorization header', () => {
    const logoutSpy = jest.spyOn(auth, 'logout');
    sessionStorage.setItem('sf2-tickets-access-token', 'token-current');
    const stale = auth.authHeaders();
    sessionStorage.setItem('sf2-tickets-access-token', 'token-new');
    httpClient.get('/api/things', { headers: stale }).subscribe({ error: () => undefined });
    http.expectOne('/api/things')
      .flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });
    expect(logoutSpy).not.toHaveBeenCalled();
  });

  it('passes successful responses through untouched', () => {
    const logoutSpy = jest.spyOn(auth, 'logout');
    let body: unknown;
    httpClient.get('/api/things').subscribe(value => { body = value; });
    http.expectOne('/api/things').flush({ ok: true });
    expect(body).toEqual({ ok: true });
    expect(logoutSpy).not.toHaveBeenCalled();
  });

  it('passes 500 errors through without logout', () => {
    const logoutSpy = jest.spyOn(auth, 'logout');
    sessionStorage.setItem('sf2-tickets-access-token', 'token-1');
    httpClient.get('/api/things', { headers: auth.authHeaders() }).subscribe({ error: () => undefined });
    http.expectOne('/api/things').flush('Boom', { status: 500, statusText: 'Server Error' });
    expect(logoutSpy).not.toHaveBeenCalled();
  });
});
