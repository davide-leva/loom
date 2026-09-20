import { HttpHeaders } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { EmailPreferencesService } from './email-preferences.service';
import { AuthService } from '../auth/auth.service';
import type { EmailPreferences } from '../../shared/models/email-preferences.types';

describe('EmailPreferencesService', () => {
  let service: EmailPreferencesService;
  let http: HttpTestingController;
  let auth: { authHeaders: jest.Mock };

  const preferences: EmailPreferences = {
    globalWantEmail: true,
    projects: [
      { projectId: 1, projectName: 'Alpha', wantEmail: true },
      { projectId: 2, projectName: 'Beta', wantEmail: null }
    ]
  };

  beforeEach(() => {
    sessionStorage.clear();
    auth = { authHeaders: jest.fn(() => new HttpHeaders({ Authorization: 'Bearer test' })) };
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: auth }
      ]
    });
    service = TestBed.inject(EmailPreferencesService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    sessionStorage.clear();
  });

  it('get() GETs the preferences', () => {
    let resolved: EmailPreferences | undefined;
    service.get().subscribe(value => { resolved = value; });
    const req = http.expectOne('/api/preferences/email');
    expect(req.request.method).toBe('GET');
    expect(req.request.headers.get('Authorization')).toBe('Bearer test');
    req.flush(preferences);
    expect(resolved).toEqual(preferences);
  });

  it('update() PUTs the entire preferences body', () => {
    const next: EmailPreferences = {
      globalWantEmail: false,
      projects: [
        { projectId: 1, projectName: 'Alpha', wantEmail: false },
        { projectId: 2, projectName: 'Beta', wantEmail: true }
      ]
    };
    let resolved: EmailPreferences | undefined;
    service.update(next).subscribe(value => { resolved = value; });
    const req = http.expectOne('/api/preferences/email');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual(next);
    expect(req.request.headers.get('Authorization')).toBe('Bearer test');
    req.flush(next);
    expect(resolved).toEqual(next);
  });
});
