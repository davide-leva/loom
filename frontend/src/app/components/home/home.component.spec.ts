import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { signal } from '@angular/core';
import { HomeComponent } from './home.component';
import { AuthService } from '../../services/auth/auth.service';
import { ProjectContextService } from '../../services/project-context/project-context.service';
import { IssuesService } from '../../services/issues/issues.service';
import { LiveSyncService } from '../../services/live-sync/live-sync.service';
import type { CurrentUser, ProjectSummary } from '../../shared/models/auth.types';
import type { IssueField, IssueFieldOption, IssueSummary, ProjectUserSummary } from '../../shared/models/issue.types';

class IssuesStub {
  issues$ = { subscribe: jest.fn() };
  issues = jest.fn(() => this.issues$);
  projectUsers$ = { subscribe: jest.fn() };
  projectUsers = jest.fn(() => this.projectUsers$);
  issueFields$ = { subscribe: jest.fn() };
  issueFields = jest.fn(() => this.issueFields$);
  issueFieldOptions$ = { subscribe: jest.fn() };
  issueFieldOptions = jest.fn(() => this.issueFieldOptions$);
  archivedIssues$ = { subscribe: jest.fn() };
  archivedIssues = jest.fn(() => this.archivedIssues$);
  deletedIssues$ = { subscribe: jest.fn() };
  deletedIssues = jest.fn(() => this.deletedIssues$);
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
  let issuesApi: IssuesStub;
  let liveSync: { revision: () => number };

  const adminUser: CurrentUser = {
    id: 1, username: 'mario', displayName: 'Mario', email: 'm@e.com',
    role: 'ADMIN', companyName: 'Acme', companyId: 10, primaryColor: 'blue',
    companyLogoUrl: null, internalCompanyName: 'Tickets', internalLogoUrl: null
  };
  const teamUser: CurrentUser = { ...adminUser, role: 'TEAM' };

  function issue(partial: Partial<IssueSummary>): IssueSummary {
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
    } as IssueSummary;
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
    issuesApi = new IssuesStub();
    liveSync = { revision: () => revisionSignal() };

    await TestBed.configureTestingModule({
      imports: [HomeComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: auth },
        { provide: ProjectContextService, useValue: projectContext },
        { provide: IssuesService, useValue: issuesApi },
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

    it('statusLabel() maps IssueStatus to italian', () => {
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

    it('filteredIssues() applies text, status, type, issuer filters', () => {
      component.issues.set([
        issue({ id: 1, title: 'login bug', status: 'REPORTED', issueType: 'ANOMALY', issuerUserId: 7, issuerUsername: 'mario' }),
        issue({ id: 2, title: 'feature', status: 'COMPLETED', issueType: 'IMPLEMENTATION', issuerUserId: 8, issuerUsername: 'anna' })
      ]);

      component.textFilter = 'feature';
      component.statusFilter = 'COMPLETED';
      component.typeFilter = 'IMPLEMENTATION';
      component.issuerFilter = 8;

      const result = component.filteredIssues();
      expect(result.map(i => i.id)).toEqual([2]);
    });

    it('filteredIssues() excludes deleted and archived by default', () => {
      component.issues.set([
        issue({ id: 1, title: 'live' }),
        issue({ id: 2, title: 'gone', archivedAt: '2026-09-19T08:00:00.000Z' }),
        issue({ id: 3, title: 'del', deletedAt: '2026-09-19T08:00:00.000Z' })
      ]);

      expect(component.filteredIssues().map(i => i.id)).toEqual([1]);
    });

    it('filteredIssues() filters by select field values', () => {
      component.issues.set([
        issue({ id: 1, selectValues: { 10: ['LOW'] } }),
        issue({ id: 2, selectValues: { 10: ['HIGH'] } })
      ]);
      component.selectFieldFilters.set([{ field: { id: 10 } as IssueField, options: [] }]);
      component.setSelectFilter(10, ['LOW']);
      expect(component.filteredIssues().map(i => i.id)).toEqual([1]);
    });

    it('setSelectFilter() stores empty array as null', () => {
      component.setSelectFilter(10, []);
      expect(component.selectFilterValues[10]).toBeNull();
    });
  });

  describe('load()', () => {
    it('does nothing when no project is selected', () => {
      fixture.detectChanges();
      expect(issuesApi.issues).not.toHaveBeenCalled();
    });

    it('fetches issues, users, fields, archived, and (admin) deleted', () => {
      userSignal.set(adminUser);
      currentProjectIdSignal.set(5);
      fixture.detectChanges();

      expect(issuesApi.issues).toHaveBeenCalledWith(5);
      expect(issuesApi.projectUsers).toHaveBeenCalledWith(5);
      expect(issuesApi.issueFields).toHaveBeenCalledWith(5);
      expect(issuesApi.issueFieldOptions).toHaveBeenCalledWith(5);
      expect(issuesApi.archivedIssues).toHaveBeenCalledWith(5);
      expect(issuesApi.deletedIssues).toHaveBeenCalledWith(5);
    });

    it('omits deletedIssues when not admin', () => {
      userSignal.set(teamUser);
      currentProjectIdSignal.set(6);
      fixture.detectChanges();
      expect(issuesApi.deletedIssues).not.toHaveBeenCalled();
    });
  });

  describe('navigation', () => {
    beforeEach(() => fixture.detectChanges());

    it('navigate() routes to given path', () => {
      const navigateSpy = jest.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
      component.navigate('/archivio');
      expect(navigateSpy).toHaveBeenCalledWith('/archivio');
    });

    it('openDetail() sets selectedIssueId', () => {
      component.openDetail({ id: 42 } as IssueSummary);
      expect(component.selectedIssueId).toBe(42);
    });

    it('onIssueCreated() prepends to issues', () => {
      component.issues.set([issue({ id: 1 })]);
      component.onIssueCreated(issue({ id: 99 }));
      expect(component.issues()[0].id).toBe(99);
      expect(component.issues()[1].id).toBe(1);
    });

    it('onIssueChanged() replaces the matching issue', () => {
      component.issues.set([issue({ id: 1, title: 'old' }), issue({ id: 2 })]);
      component.onIssueChanged(issue({ id: 1, title: 'new' }));
      expect(component.issues()[0].title).toBe('new');
    });

    it('onIssueDeleted() removes the matching issue', () => {
      component.issues.set([issue({ id: 1 }), issue({ id: 2 })]);
      component.onIssueDeleted(1);
      expect(component.issues().map(i => i.id)).toEqual([2]);
    });
  });
});