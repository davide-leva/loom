import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { signal } from '@angular/core';
import { HomeComponent } from './home.component';
import { AuthService } from '../../services/auth/auth.service';
import { ProjectContextService } from '../../services/project-context/project-context.service';
import { SegnalazioniService } from '../../services/segnalazioni/segnalazioni.service';
import { LiveSyncService } from '../../services/live-sync/live-sync.service';
import type { CurrentUser, ProjectSummary } from '../../shared/models/auth.types';
import type { SegnalazioneCampo, SegnalazioneCampoOpzione, SegnalazioneSummary, ProjectUserSummary } from '../../shared/models/segnalazione.types';

class SegnalazioniStub {
  segnalazioni$ = { subscribe: jest.fn() };
  segnalazioni = jest.fn(() => this.segnalazioni$);
  projectUsers$ = { subscribe: jest.fn() };
  projectUsers = jest.fn(() => this.projectUsers$);
  segnalazioneCampi$ = { subscribe: jest.fn() };
  segnalazioneCampi = jest.fn(() => this.segnalazioneCampi$);
  segnalazioneCampoOpzioni$ = { subscribe: jest.fn() };
  segnalazioneCampoOpzioni = jest.fn(() => this.segnalazioneCampoOpzioni$);
  segnalazioniArchiviate$ = { subscribe: jest.fn() };
  segnalazioniArchiviate = jest.fn(() => this.segnalazioniArchiviate$);
  segnalazioniEliminate$ = { subscribe: jest.fn() };
  segnalazioniEliminate = jest.fn(() => this.segnalazioniEliminate$);
}

describe('HomeComponent', () => {
  let fixture: ComponentFixture<HomeComponent>;
  let component: HomeComponent;
  let http: HttpTestingController;
  let router: Router;
  let userSignal: ReturnType<typeof signal<CurrentUser | null>>;
  let currentProjectIdSignal: ReturnType<typeof signal<number | null>>;
  let projectsSignal: ReturnType<typeof signal<ProjectSummary[]>>;
  let revisionSignal: ReturnType<typeof signal<number>>;
  let auth: { user: () => CurrentUser | null };
  let projectContext: { currentProjectId: () => number | null; currentProject: () => ProjectSummary | null;
                        projects: () => ProjectSummary[] };
  let segnalazioniApi: SegnalazioniStub;
  let liveSync: { revision: () => number };

  const adminUser: CurrentUser = {
    id: 1, username: 'mario', displayName: 'Mario', email: 'm@e.com',
    role: 'ADMIN', companyName: 'Acme', companyId: 10, primaryColor: 'blue',
    companyLogoUrl: null, internalCompanyName: 'Loom', internalLogoUrl: null
  };
  const teamUser: CurrentUser = { ...adminUser, role: 'TEAM' };

  function segnalazione(partial: Partial<SegnalazioneSummary>): SegnalazioneSummary {
    return {
      id: 1, projectId: 1, title: 'T', description: 'D',
      createdAt: '2026-09-19T08:00:00.000Z',
      status: 'REPORTED', issueType: null,
      releasedAt: null, approvedAt: null,
      issuerUserId: null, issuerUsername: null,
      devUserId: null, devUsername: null,
      approveUserId: null, approveUsername: null,
      internal: false, deletedAt: null, archivedAt: null,
      selectValues: {},
      ...partial
    } as SegnalazioneSummary;
  }

  beforeEach(async () => {
    userSignal = signal<CurrentUser | null>(null);
    currentProjectIdSignal = signal<number | null>(null);
    projectsSignal = signal<ProjectSummary[]>([]);
    revisionSignal = signal(0);

    auth = { user: () => userSignal() };
    projectContext = {
      currentProjectId: () => currentProjectIdSignal(),
      currentProject: () => projectsSignal()[0] ?? null,
      projects: () => projectsSignal()
    };
    segnalazioniApi = new SegnalazioniStub();
    liveSync = { revision: () => revisionSignal() };

    await TestBed.configureTestingModule({
      imports: [HomeComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: auth },
        { provide: ProjectContextService, useValue: projectContext },
        { provide: SegnalazioniService, useValue: segnalazioniApi },
        { provide: LiveSyncService, useValue: liveSync }
      ]
    }).compileComponents();

    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    fixture = TestBed.createComponent(HomeComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    http.verify();
  });

  describe('pure helpers', () => {
    beforeEach(() => {
      fixture.detectChanges();
    });

    it('issuerOptions() includes Tutti, Non assegnato, then users', () => {
      component.users.set([
        { id: 7, username: 'mario', firstName: 'Mario', lastName: 'Rossi', role: 'TEAM' },
        { id: 8, username: 'anna', firstName: null, lastName: null, role: 'USER' }
      ]);
      const opts = component.issuerOptions();
      expect(opts[0]).toEqual({ label: 'Tutti', value: 'ALL' });
      expect(opts[1]).toEqual({ label: 'Non assegnato', value: 'NONE' });
      expect(opts[2]).toEqual({ label: 'Mario Rossi', value: 7 });
      expect(opts[3]).toEqual({ label: 'anna', value: 8 });
    });

    it('statusLabel() maps StatusSegnalazione to italian', () => {
      expect(component.statusLabel('REPORTED')).toBe('Segnalato');
      expect(component.statusLabel('IN_PROGRESS')).toBe('In lavorazione');
      expect(component.statusLabel('COMPLETED')).toBe('Completato');
      expect(component.statusLabel('RELEASED')).toBe('Rilasciato');
      expect(component.statusLabel('APPROVED')).toBe('Approvato');
    });

    it('typeLabel() returns "Non categorizzata" for null', () => {
      expect(component.typeLabel(null)).toBe('Non categorizzata');
      expect(component.typeLabel('ANOMALY')).toBe('Anomalia');
      expect(component.typeLabel('IMPROVEMENT')).toBe('Miglioria');
      expect(component.typeLabel('IMPLEMENTATION')).toBe('Implementazione');
    });

    it('statusSeverity() maps statuses correctly', () => {
      expect(component.statusSeverity('REPORTED')).toBe('info');
      expect(component.statusSeverity('IN_PROGRESS')).toBe('warn');
      expect(component.statusSeverity('COMPLETED')).toBe('success');
      expect(component.statusSeverity('RELEASED')).toBe('secondary');
      expect(component.statusSeverity('APPROVED')).toBe('contrast');
    });

    it('resetFilters() clears all filter state', () => {
      component.textFilter = 'foo';
      component.statusFilter = 'COMPLETED';
      component.typeFilter = 'NONE';
      component.issuerFilter = 'NONE';
      component.dateRange = [new Date(), new Date()];
      component.selectFilterValues = { 10: ['v'] };

      component.resetFilters();

      expect(component.textFilter).toBe('');
      expect(component.statusFilter).toBe('ALL');
      expect(component.typeFilter).toBe('ALL');
      expect(component.issuerFilter).toBe('ALL');
      expect(component.dateRange).toBeNull();
      expect(component.selectFilterValues).toEqual({});
    });

    it('segnalazioniFiltrate() applies text, status, type, issuer filters', () => {
      component.segnalazioni.set([
        segnalazione({ id: 1, title: 'login bug', status: 'REPORTED', issueType: 'ANOMALY', issuerUserId: 7, issuerUsername: 'mario' }),
        segnalazione({ id: 2, title: 'feature', status: 'COMPLETED', issueType: 'IMPLEMENTATION', issuerUserId: 8, issuerUsername: 'anna' })
      ]);

      component.textFilter = 'feature';
      component.statusFilter = 'COMPLETED';
      component.typeFilter = 'IMPLEMENTATION';
      component.issuerFilter = 8;

      const result = component.segnalazioniFiltrate();
      expect(result.map(i => i.id)).toEqual([2]);
    });

    it('segnalazioniFiltrate() excludes deleted and archived by default', () => {
      component.segnalazioni.set([
        segnalazione({ id: 1, title: 'live' }),
        segnalazione({ id: 2, title: 'gone', archivedAt: '2026-09-19T08:00:00.000Z' }),
        segnalazione({ id: 3, title: 'del', deletedAt: '2026-09-19T08:00:00.000Z' })
      ]);

      expect(component.segnalazioniFiltrate().map(i => i.id)).toEqual([1]);
    });

    it('segnalazioniFiltrate() filters by select field values', () => {
      component.segnalazioni.set([
        segnalazione({ id: 1, selectValues: { 10: ['LOW'] } }),
        segnalazione({ id: 2, selectValues: { 10: ['HIGH'] } })
      ]);
      component.selectFieldFilters.set([{ field: { id: 10 } as SegnalazioneCampo, options: [] }]);
      component.setSelectFilter(10, ['LOW']);
      expect(component.segnalazioniFiltrate().map(i => i.id)).toEqual([1]);
    });

    it('setSelectFilter() stores empty array as null', () => {
      component.setSelectFilter(10, []);
      expect(component.selectFilterValues[10]).toBeNull();
    });
  });

  describe('load()', () => {
    it('does nothing when no project is selected', () => {
      fixture.detectChanges();
      expect(segnalazioniApi.segnalazioni).not.toHaveBeenCalled();
    });

    it('fetches issues, users, fields, archived, and (admin) deleted', () => {
      userSignal.set(adminUser);
      currentProjectIdSignal.set(5);
      fixture.detectChanges();

      expect(segnalazioniApi.segnalazioni).toHaveBeenCalledWith(5);
      expect(segnalazioniApi.projectUsers).toHaveBeenCalledWith(5);
      expect(segnalazioniApi.segnalazioneCampi).toHaveBeenCalledWith(5);
      expect(segnalazioniApi.segnalazioneCampoOpzioni).toHaveBeenCalledWith(5);
      expect(segnalazioniApi.segnalazioniArchiviate).toHaveBeenCalledWith(5);
      expect(segnalazioniApi.segnalazioniEliminate).toHaveBeenCalledWith(5);
    });

    it('omits deletedIssues when not admin', () => {
      userSignal.set(teamUser);
      currentProjectIdSignal.set(6);
      fixture.detectChanges();
      expect(segnalazioniApi.segnalazioniEliminate).not.toHaveBeenCalled();
    });
  });

  describe('navigation', () => {
    beforeEach(() => fixture.detectChanges());

    it('navigate() routes to given path', () => {
      const navigateSpy = jest.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
      component.navigate('/archivio');
      expect(navigateSpy).toHaveBeenCalledWith('/archivio');
    });

    it('openDetail() sets segnalazioneSelezionataId', () => {
      component.openDetail({ id: 42 } as SegnalazioneSummary);
      expect(component.segnalazioneSelezionataId).toBe(42);
    });

    it('onSegnalazioneCreata() prepends to issues', () => {
      component.segnalazioni.set([segnalazione({ id: 1 })]);
      component.onSegnalazioneCreata(segnalazione({ id: 99 }));
      expect(component.segnalazioni()[0].id).toBe(99);
      expect(component.segnalazioni()[1].id).toBe(1);
    });

    it('onSegnalazioneModificata() replaces the matching issue', () => {
      component.segnalazioni.set([segnalazione({ id: 1, title: 'old' }), segnalazione({ id: 2 })]);
      component.onSegnalazioneModificata(segnalazione({ id: 1, title: 'new' }));
      expect(component.segnalazioni()[0].title).toBe('new');
    });

    it('onSegnalazioneEliminata() removes the matching issue', () => {
      component.segnalazioni.set([segnalazione({ id: 1 }), segnalazione({ id: 2 })]);
      component.onSegnalazioneEliminata(1);
      expect(component.segnalazioni().map(i => i.id)).toEqual([2]);
    });
  });
});