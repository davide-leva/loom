import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { Router, provideRouter } from '@angular/router';
import { ProjectContextService } from './project-context.service';
import { AuthService } from '../auth/auth.service';
import type { CurrentUser, ProjectSummary } from '../../shared/models/auth.types';

describe('ProjectContextService', () => {
  let service: ProjectContextService;
  let http: HttpTestingController;
  let httpClient: HttpClient;
  let auth: {
    authHeaders: jest.Mock;
    user: { set: (value: CurrentUser | null) => void; (): CurrentUser | null };
    projects: jest.Mock;
    logout: jest.Mock;
  };
  let router: Router;

  const user: CurrentUser = {
    id: 42,
    username: 'mario',
    displayName: 'Mario',
    email: 'mario@test',
    role: 'TEAM',
    companyName: 'ACME',
    companyId: 1,
    primaryColor: 'blue',
    companyLogoUrl: null,
    internalCompanyName: null,
    internalLogoUrl: null
  };

  const projects: ProjectSummary[] = [
    { id: 1, name: 'Alpha', logoUrl: null },
    { id: 2, name: 'Beta', logoUrl: null }
  ];

  beforeEach(() => {
    sessionStorage.clear();
    clearProjectCookie();
    auth = {
      authHeaders: jest.fn(),
      user: Object.assign(jest.fn(() => user), { set: jest.fn() }),
      projects: jest.fn(),
      logout: jest.fn()
    };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: auth }
      ]
    });
    service = TestBed.inject(ProjectContextService);
    http = TestBed.inject(HttpTestingController);
    httpClient = TestBed.inject(HttpClient);
    router = TestBed.inject(Router);
    // AuthService.projects() hits /api/auth/projects via HttpClient; let the mock delegate to it.
    auth.projects.mockImplementation(() => httpClient.get<ProjectSummary[]>('/api/auth/projects'));
  });

  afterEach(() => {
    http.verify();
    clearProjectCookie();
    sessionStorage.clear();
  });

  it('load() populates signals and selects the first project by default', () => {
    service.load();
    const req = http.expectOne('/api/auth/projects');
    expect(req.request.method).toBe('GET');
    req.flush(projects);
    expect(service.projects()).toEqual(projects);
    expect(service.currentProjectId()).toBe(1);
    expect(service.currentProject()).toEqual(projects[0]);
    expect(document.cookie).toContain('loom-current-project-42=1');
  });

  it('load() picks the saved project from the cookie when it is still valid', () => {
    document.cookie = 'loom-current-project-42=2; Path=/';
    service.load();
    const req = http.expectOne('/api/auth/projects');
    req.flush(projects);
    expect(service.currentProjectId()).toBe(2);
    expect(service.currentProject()).toEqual(projects[1]);
  });

  it('load() falls back to the first project when the saved id is unknown', () => {
    document.cookie = 'loom-current-project-42=999; Path=/';
    service.load();
    const req = http.expectOne('/api/auth/projects');
    req.flush(projects);
    expect(service.currentProjectId()).toBe(1);
  });

  it('load() logs out and redirects to /login on 401', () => {
    const navigateSpy = jest.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    service.load();
    const req = http.expectOne('/api/auth/projects');
    req.flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });
    expect(auth.logout).toHaveBeenCalled();
    expect(navigateSpy).toHaveBeenCalledWith('/login');
    expect(service.loadError()).toBe(false);
    expect(service.projects()).toEqual([]);
  });

  it('load() logs out and redirects to /login on 403', () => {
    const navigateSpy = jest.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    service.load();
    const req = http.expectOne('/api/auth/projects');
    req.flush('Forbidden', { status: 403, statusText: 'Forbidden' });
    expect(auth.logout).toHaveBeenCalled();
    expect(navigateSpy).toHaveBeenCalledWith('/login');
  });

  it('load() flags loadError on generic failures without logging out', () => {
    const navigateSpy = jest.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    service.load();
    const req = http.expectOne('/api/auth/projects');
    req.flush('Boom', { status: 500, statusText: 'Server Error' });
    expect(auth.logout).not.toHaveBeenCalled();
    expect(navigateSpy).not.toHaveBeenCalled();
    expect(service.loadError()).toBe(true);
    expect(service.projects()).toEqual([]);
  });

  it('select() updates the current project id when it is part of the list', () => {
    service.load();
    http.expectOne('/api/auth/projects').flush(projects);
    service.select(2);
    expect(service.currentProjectId()).toBe(2);
    expect(service.currentProject()).toEqual(projects[1]);
    expect(document.cookie).toContain('loom-current-project-42=2');
  });

  it('select() ignores ids that are not in the project list', () => {
    service.load();
    http.expectOne('/api/auth/projects').flush(projects);
    service.select(999);
    expect(service.currentProjectId()).toBe(1);
  });

  it('select(null) is a no-op', () => {
    service.load();
    http.expectOne('/api/auth/projects').flush(projects);
    service.select(null);
    expect(service.currentProjectId()).toBe(1);
  });

  it('rememberExternalProject() persists a cookie without changing the active project', () => {
    service.rememberExternalProject(2);
    expect(document.cookie).toContain('loom-current-project-42=2');
    expect(service.currentProjectId()).toBeNull();
  });

  it('currentProject() returns null when no project matches', () => {
    expect(service.currentProject()).toBeNull();
  });

  it('clear() resets all signals', () => {
    service.load();
    http.expectOne('/api/auth/projects').flush(projects);
    service.clear();
    expect(service.projects()).toEqual([]);
    expect(service.currentProjectId()).toBeNull();
    expect(service.loadError()).toBe(false);
  });

  it('load() ignores stale responses when the user changes mid-flight', () => {
    service.load();
    const req = http.expectOne('/api/auth/projects');
    auth.user.mockReturnValueOnce({ ...user, id: 99 });
    req.flush(projects);
    expect(service.projects()).toEqual([]);
  });
});

function clearProjectCookie(): void {
  // Clear the cookies the service may have set under both possible user ids.
  document.cookie = 'loom-current-project-42=; Path=/; Max-Age=0';
  document.cookie = 'loom-current-project-anonymous=; Path=/; Max-Age=0';
  document.cookie = 'loom-current-project-99=; Path=/; Max-Age=0';
}
