import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { signal } from '@angular/core';
import { MainLayoutComponent } from './main-layout.component';
import { AuthService } from '../../services/auth/auth.service';
import { ProjectContextService } from '../../services/project-context/project-context.service';
import { LiveSyncService } from '../../services/live-sync/live-sync.service';
import { NotificheSegnalazioniService } from '../../services/notifiche-segnalazioni/notifiche-segnalazioni.service';
import { VersionService } from '../../services/version/version.service';
import type { CurrentUser, ProjectSummary } from '../../shared/models/auth.types';

describe('MainLayoutComponent', () => {
  let fixture: ComponentFixture<MainLayoutComponent>;
  let component: MainLayoutComponent;
  let router: Router;
  let userSignal: ReturnType<typeof signal<CurrentUser | null>>;
  let projectsSignal: ReturnType<typeof signal<ProjectSummary[]>>;
  let currentProjectIdSignal: ReturnType<typeof signal<number | null>>;
  let loadErrorSignal: ReturnType<typeof signal<boolean>>;
  let revisionSignal: ReturnType<typeof signal<number>>;
  let connectedSignal: ReturnType<typeof signal<boolean>>;
  let auth: { logout: jest.Mock };
  let projectContext: { load: jest.Mock; clear: jest.Mock; currentProjectId: () => number | null;
                        projects: () => ProjectSummary[]; loadError: () => boolean };
  let liveSync: { watch: jest.Mock; revision: () => number; connected: () => boolean };
  let notifications: { refresh: jest.Mock; clear: jest.Mock; count: jest.Mock; isUnread: jest.Mock;
                        planningCount: () => number; anomaliesCount: () => number;
                        improvementsCount: () => number; implementationsCount: () => number;
                        totalCount: () => number };
  let versionInfoSignal: ReturnType<typeof signal<unknown>>;
  let version: { load: jest.Mock; info: typeof versionInfoSignal };

  beforeEach(async () => {
    sessionStorage.clear();
    userSignal = signal<CurrentUser | null>(null);
    projectsSignal = signal<ProjectSummary[]>([]);
    currentProjectIdSignal = signal<number | null>(null);
    loadErrorSignal = signal(false);
    revisionSignal = signal(0);
    connectedSignal = signal(false);

    auth = { logout: jest.fn() };
    projectContext = {
      load: jest.fn(),
      clear: jest.fn(),
      currentProjectId: () => currentProjectIdSignal(),
      projects: () => projectsSignal(),
      loadError: () => loadErrorSignal()
    };
    liveSync = {
      watch: jest.fn(() => ({ unsubscribe: jest.fn() } as any)),
      revision: () => revisionSignal(),
      connected: () => connectedSignal()
    };
    notifications = { refresh: jest.fn(), clear: jest.fn(), count: jest.fn(() => 0),
                      isUnread: jest.fn(() => false),
                      planningCount: () => 0, anomaliesCount: () => 0,
                      improvementsCount: () => 0, implementationsCount: () => 0,
                      totalCount: () => 0 };
    versionInfoSignal = signal<unknown>(null);
    version = { load: jest.fn(), info: versionInfoSignal };

    await TestBed.configureTestingModule({
      imports: [MainLayoutComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { ...auth, user: userSignal } },
        { provide: ProjectContextService, useValue: projectContext },
        { provide: LiveSyncService, useValue: liveSync },
        { provide: NotificheSegnalazioniService, useValue: notifications },
        { provide: VersionService, useValue: version }
      ]
    }).compileComponents();

    router = TestBed.inject(Router);
    fixture = TestBed.createComponent(MainLayoutComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it('userMenuItems() includes company name from current user', () => {
    userSignal.set({
      id: 1, username: 'mario', displayName: 'Mario', email: 'm@e.com',
      role: 'ADMIN', companyName: 'Acme', companyId: 10, primaryColor: 'blue',
      companyLogoUrl: null, internalCompanyName: 'Loom', internalLogoUrl: null
    });

    const items = component.userMenuItems();
    expect(items[0].label).toBe('Compagnia: Acme');
  });

  it('userMenuItems() falls back to internalCompanyName', () => {
    userSignal.set({
      id: 1, username: 'mario', displayName: 'Mario', email: 'm@e.com',
      role: 'USER', companyName: null, companyId: null, primaryColor: 'blue',
      companyLogoUrl: null, internalCompanyName: 'Loom', internalLogoUrl: null
    });

    const items = component.userMenuItems();
    expect(items[0].label).toBe('Compagnia: Loom');
  });

  it('userMenuItems() falls back to "Interna" when no company', () => {
    userSignal.set({
      id: 1, username: 'mario', displayName: 'Mario', email: 'm@e.com',
      role: 'USER', companyName: null, companyId: null, primaryColor: 'blue',
      companyLogoUrl: null, internalCompanyName: null, internalLogoUrl: null
    });

    const items = component.userMenuItems();
    expect(items[0].label).toBe('Compagnia: Interna');
  });

  it('userMenuItems() includes logout and email-preferences', () => {
    const items = component.userMenuItems();
    const labels = items.map(i => i.label).filter(Boolean);
    expect(labels).toEqual(expect.arrayContaining(['Notifiche email', 'Logout']));
  });

  it('logout() clears notifications, context and auth, then navigates to /login', () => {
    const navigateSpy = jest.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    component.logout();

    expect(notifications.clear).toHaveBeenCalled();
    expect(projectContext.clear).toHaveBeenCalled();
    expect(auth.logout).toHaveBeenCalled();
    expect(navigateSpy).toHaveBeenCalledWith('/login');
  });

  it('ngOnInit triggers projectContext.load()', () => {
    expect(projectContext.load).toHaveBeenCalled();
  });

  it('effect calls liveSync.watch() when a project is selected', () => {
    currentProjectIdSignal.set(7);
    fixture.detectChanges();
    expect(liveSync.watch).toHaveBeenCalledWith(7);
  });

  it('effect does NOT watch when there is no projectId', () => {
    liveSync.watch.mockClear();
    currentProjectIdSignal.set(null);
    fixture.detectChanges();
    expect(liveSync.watch).not.toHaveBeenCalled();
  });

  it('effect calls notifications.refresh(projectId) when project set', () => {
    currentProjectIdSignal.set(12);
    fixture.detectChanges();
    expect(notifications.refresh).toHaveBeenCalledWith(12);
  });

  it('effect calls notifications.clear() when project is unset', () => {
    notifications.refresh.mockClear();
    notifications.clear.mockClear();
    currentProjectIdSignal.set(11);
    fixture.detectChanges();
    notifications.refresh.mockClear();
    notifications.clear.mockClear();

    currentProjectIdSignal.set(null);
    fixture.detectChanges();
    expect(notifications.clear).toHaveBeenCalled();
    expect(notifications.refresh).not.toHaveBeenCalled();
  });

  it('projects() signal is read from auth.projects()', () => {
    projectsSignal.set([
      { id: 1, name: 'Alpha', logoUrl: null },
      { id: 2, name: 'Beta', logoUrl: null }
    ]);
    fixture.detectChanges();
    expect(component.projectContext.projects().length).toBe(2);
  });
});