import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { Confirmation, ConfirmationService, MessageService } from 'primeng/api';
import { signal } from '@angular/core';
import { Subject } from 'rxjs';
import { ArchivedIssuesComponent } from './archived-issues.component';
import { IssuesService } from '../../services/issues/issues.service';
import { ProjectContextService } from '../../services/project-context/project-context.service';
import { LiveSyncService } from '../../services/live-sync/live-sync.service';
import { AuthService } from '../../services/auth/auth.service';
import type { CurrentUser } from '../../shared/models/auth.types';
import type { IssueSummary, ProjectUserSummary } from '../../shared/models/issue.types';

class IssuesStub {
  archivedIssues$ = new Subject<IssueSummary[]>();
  archivedIssues = jest.fn(() => this.archivedIssues$.asObservable());
  permanentlyDeleteIssues$ = new Subject<void>();
  permanentlyDeleteIssues = jest.fn(() => this.permanentlyDeleteIssues$.asObservable());
}

function userOf(role: string): CurrentUser {
  return {
    id: 1, username: 'mario', displayName: 'Mario', email: 'm@e.com',
    role, companyName: 'Acme', companyId: 10, primaryColor: 'blue',
    companyLogoUrl: null, internalCompanyName: 'Tickets', internalLogoUrl: null
  } as CurrentUser;
}

function issue(partial: Partial<IssueSummary>): IssueSummary {
  return {
    id: 1, projectId: 1, title: 'T', description: 'D',
    createdAt: '2026-09-19T08:00:00.000Z', archivedAt: '2026-09-19T10:00:00.000Z',
    status: 'APPROVED', issueType: null,
    releasedAt: null, approvedAt: '2026-09-19T09:00:00.000Z',
    issuerUserId: null, issuerUsername: null,
    devUserId: null, devUsername: null,
    approveUserId: null, approveUsername: null,
    internal: false, deletedAt: null,
    selectValues: {},
    ...partial
  } as IssueSummary;
}

describe('ArchivedIssuesComponent', () => {
  let fixture: ComponentFixture<ArchivedIssuesComponent>;
  let component: ArchivedIssuesComponent;
  let router: Router;
  let issuesApi: IssuesStub;
  let currentProjectIdSignal: ReturnType<typeof signal<number | null>>;
  let revisionSignal: ReturnType<typeof signal<number>>;
  let userSignal: ReturnType<typeof signal<CurrentUser | null>>;
  let confirmation: { confirm: jest.Mock; requireConfirmation$: Subject<any> };
  let messageService: { add: jest.Mock; messageObserver: Subject<any>; clearObserver: Subject<any> };

  beforeEach(async () => {
    issuesApi = new IssuesStub();
    currentProjectIdSignal = signal<number | null>(null);
    revisionSignal = signal(0);
    userSignal = signal<CurrentUser | null>(null);
    confirmation = { confirm: jest.fn(), requireConfirmation$: new Subject() };
    messageService = { add: jest.fn(), messageObserver: new Subject(), clearObserver: new Subject() };

    await TestBed.configureTestingModule({
      imports: [ArchivedIssuesComponent],
      providers: [
        provideRouter([]),
        provideAnimationsAsync('noop'),
        { provide: IssuesService, useValue: issuesApi },
        { provide: ProjectContextService, useValue: { currentProjectId: () => currentProjectIdSignal(), currentProject: () => null } },
        { provide: LiveSyncService, useValue: { revision: () => revisionSignal() } },
        { provide: AuthService, useValue: { user: () => userSignal() } },
        ConfirmationService,
        MessageService,
        { provide: Confirmation, useValue: new Subject() }
      ]
    })
    .overrideComponent(ArchivedIssuesComponent, {
      set: { providers: [
        { provide: ConfirmationService, useValue: confirmation },
        { provide: MessageService, useValue: messageService }
      ] }
    })
    .compileComponents();

    router = TestBed.inject(Router);
    fixture = TestBed.createComponent(ArchivedIssuesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  describe('canDelete() and resetFilters()', () => {
    it('canDelete() is true for ADMIN', () => {
      userSignal.set(userOf('ADMIN'));
      expect(component.canDelete()).toBe(true);
    });

    it('canDelete() is false for other roles', () => {
      userSignal.set(userOf('TEAM'));
      expect(component.canDelete()).toBe(false);
      userSignal.set(userOf('USER'));
      expect(component.canDelete()).toBe(false);
    });

    it('resetFilters() resets to defaults', () => {
      component.textFilter = 'x';
      component.statusFilter = 'COMPLETED';
      component.typeFilter = 'ANOMALY';
      component.issuerFilter = 5;
      component.dateRange = [new Date(), new Date()];
      component.resetFilters();
      expect(component.textFilter).toBe('');
      expect(component.statusFilter).toBe('ALL');
      expect(component.typeFilter).toBe('ALL');
      expect(component.issuerFilter).toBe('ALL');
      expect(component.dateRange).toBeNull();
    });
  });

  describe('filteredIssues()', () => {
    beforeEach(() => {
      component.issues.set([
        issue({ id: 1, title: 'login broken' }),
        issue({ id: 2, title: 'no permission', issueType: 'ANOMALY' }),
        issue({ id: 3, title: 'slow dashboard', status: 'COMPLETED', issueType: 'IMPROVEMENT' }),
        issue({ id: 4, title: 'misc', deletedAt: '2026-09-19T08:00:00.000Z' })
      ]);
    });

    it('excludes deleted issues', () => {
      expect(component.filteredIssues().map(i => i.id)).toEqual([1, 2, 3]);
    });

    it('filters by text', () => {
      component.textFilter = 'login';
      expect(component.filteredIssues().map(i => i.id)).toEqual([1]);
    });

    it('filters by status', () => {
      component.statusFilter = 'COMPLETED';
      expect(component.filteredIssues().map(i => i.id)).toEqual([3]);
    });

    it('filters by type NONE for null types', () => {
      component.typeFilter = 'NONE';
      expect(component.filteredIssues().map(i => i.id)).toEqual([1]);
    });
  });

  describe('issuerOptions()', () => {
    it('returns Tutti + Non assegnato + users', () => {
      component.users.set([
        { id: 1, username: 'mario', firstName: 'Mario', lastName: 'Rossi', role: 'TEAM' },
        { id: 2, username: 'anna', firstName: null, lastName: null, role: 'USER' }
      ]);
      const opts = component.issuerOptions();
      expect(opts[0]).toEqual({ label: 'Tutti', value: 'ALL' });
      expect(opts[1]).toEqual({ label: 'Non assegnato', value: 'NONE' });
      expect(opts.find(o => o.value === 1)?.label).toBe('Mario Rossi');
      expect(opts.find(o => o.value === 2)?.label).toBe('anna');
    });
  });

  describe('statusLabel / statusSeverity / typeLabel', () => {
    it('statusLabel and typeLabel', () => {
      expect(component.statusLabel('REPORTED')).toBe('Segnalato');
      expect(component.typeLabel(null)).toBe('Non categorizzata');
      expect(component.typeLabel('ANOMALY')).toBe('Anomalia');
    });

    it('statusSeverity returns expected values', () => {
      expect(component.statusSeverity('REPORTED')).toBe('info');
      expect(component.statusSeverity('APPROVED')).toBe('contrast');
      expect(component.statusSeverity('COMPLETED')).toBe('success');
    });
  });

  describe('load()', () => {
    it('stores issues on success', () => {
      currentProjectIdSignal.set(5);
      fixture.detectChanges();
      issuesApi.archivedIssues$.next([issue({ id: 1 }), issue({ id: 2 })]);
      issuesApi.archivedIssues$.complete();
      expect(component.issues().length).toBe(2);
      expect(component.loading()).toBe(false);
    });

    it('sets error on failure', () => {
      currentProjectIdSignal.set(5);
      fixture.detectChanges();
      issuesApi.archivedIssues$.error(new Error('boom'));
      expect(component.error()).toBe('Non riesco a caricare le segnalazioni archiviate.');
    });

    it('does nothing when no project', () => {
      expect(issuesApi.archivedIssues).not.toHaveBeenCalled();
    });
  });

  describe('confirmPermanentDelete() and permanentlyDelete()', () => {
    it('does nothing when canDelete is false', () => {
      userSignal.set(userOf('USER'));
      component.selected = [issue({ id: 1 })];
      component.confirmPermanentDelete();
      expect(confirmation.confirm).not.toHaveBeenCalled();
    });

    it('does nothing when no selection', () => {
      userSignal.set(userOf('ADMIN'));
      component.selected = [];
      component.confirmPermanentDelete();
      expect(confirmation.confirm).not.toHaveBeenCalled();
    });

    it('opens confirm dialog with summary message', () => {
      userSignal.set(userOf('ADMIN'));
      component.selected = [issue({ id: 1 }), issue({ id: 2 })];
      component.confirmPermanentDelete();
      expect(confirmation.confirm).toHaveBeenCalled();
      const opts = confirmation.confirm.mock.calls[0][0];
      expect(opts.header).toBe('Eliminazione definitiva');
      expect(opts.message).toContain('2 segnalazioni');
      opts.accept();
      expect(issuesApi.permanentlyDeleteIssues).toHaveBeenCalledWith([1, 2]);
    });

    it('uses singular message text for one item', () => {
      userSignal.set(userOf('ADMIN'));
      component.selected = [issue({ id: 1 })];
      component.confirmPermanentDelete();
      const opts = confirmation.confirm.mock.calls[0][0];
      expect(opts.message).toContain('1 segnalazione archiviata');
    });

    it('completes delete and reloads on success', () => {
      const addSpy = messageService.add;
      userSignal.set(userOf('ADMIN'));
      component.selected = [issue({ id: 1 }), issue({ id: 2 })];
      component.confirmPermanentDelete();
      const opts = confirmation.confirm.mock.calls[0][0];
      opts.accept();
      issuesApi.permanentlyDeleteIssues$.next();
      issuesApi.permanentlyDeleteIssues$.complete();
      expect(addSpy).toHaveBeenCalledWith(expect.objectContaining({ severity: 'success' }));
      expect(component.deleting()).toBe(false);
    });

    it('shows error message on failure', () => {
      const addSpy = messageService.add;
      userSignal.set(userOf('ADMIN'));
      component.selected = [issue({ id: 1 })];
      component.confirmPermanentDelete();
      const opts = confirmation.confirm.mock.calls[0][0];
      opts.accept();
      issuesApi.permanentlyDeleteIssues$.error(new Error('boom'));
      expect(addSpy).toHaveBeenCalledWith(expect.objectContaining({ severity: 'error' }));
    });
  });

  describe('back()', () => {
    it('navigates to dashboard', () => {
      const spy = jest.spyOn(router, 'navigateByUrl');
      component.back();
      expect(spy).toHaveBeenCalledWith('/dashboard');
    });
  });
});