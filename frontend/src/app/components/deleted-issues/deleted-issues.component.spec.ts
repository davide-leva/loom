import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { ConfirmationService, MessageService } from 'primeng/api';
import { signal } from '@angular/core';
import { Subject } from 'rxjs';
import { DeletedIssuesComponent } from './deleted-issues.component';
import { IssuesService } from '../../services/issues/issues.service';
import { ProjectContextService } from '../../services/project-context/project-context.service';
import { LiveSyncService } from '../../services/live-sync/live-sync.service';
import type { IssueSummary } from '../../shared/models/issue.types';

class IssuesStub {
  deletedIssues$ = new Subject<IssueSummary[]>();
  deletedIssues = jest.fn(() => this.deletedIssues$.asObservable());
  permanentlyDeleteIssues$ = new Subject<void>();
  permanentlyDeleteIssues = jest.fn(() => this.permanentlyDeleteIssues$.asObservable());
}

function issue(partial: Partial<IssueSummary>): IssueSummary {
  return {
    id: 1, projectId: 1, title: 'T', description: 'D',
    createdAt: '2026-09-19T08:00:00.000Z', deletedAt: '2026-09-19T10:00:00.000Z',
    status: 'REPORTED', issueType: null,
    releasedAt: null, approvedAt: null,
    issuerUserId: null, issuerUsername: null,
    devUserId: null, devUsername: null,
    approveUserId: null, approveUsername: null,
    internal: false, archivedAt: null,
    selectValues: {},
    ...partial
  } as IssueSummary;
}

describe('DeletedIssuesComponent', () => {
  let fixture: ComponentFixture<DeletedIssuesComponent>;
  let component: DeletedIssuesComponent;
  let router: Router;
  let issuesApi: IssuesStub;
  let currentProjectIdSignal: ReturnType<typeof signal<number | null>>;
  let revisionSignal: ReturnType<typeof signal<number>>;
  let confirmation: { confirm: jest.Mock; requireConfirmation$: Subject<any> };
  let messageService: { add: jest.Mock; messageObserver: Subject<any>; clearObserver: Subject<any> };

  beforeEach(async () => {
    issuesApi = new IssuesStub();
    currentProjectIdSignal = signal<number | null>(null);
    revisionSignal = signal(0);
    confirmation = { confirm: jest.fn(), requireConfirmation$: new Subject() };
    messageService = { add: jest.fn(), messageObserver: new Subject(), clearObserver: new Subject() };

    await TestBed.configureTestingModule({
      imports: [DeletedIssuesComponent],
      providers: [
        provideRouter([]),
        provideAnimationsAsync('noop'),
        ConfirmationService,
        MessageService,
        { provide: IssuesService, useValue: issuesApi },
        { provide: ProjectContextService, useValue: { currentProjectId: () => currentProjectIdSignal(), currentProject: () => null } },
        { provide: LiveSyncService, useValue: { revision: () => revisionSignal() } }
      ]
    })
    .overrideComponent(DeletedIssuesComponent, {
      set: { providers: [
        { provide: ConfirmationService, useValue: confirmation },
        { provide: MessageService, useValue: messageService }
      ] }
    })
    .compileComponents();

    router = TestBed.inject(Router);
    fixture = TestBed.createComponent(DeletedIssuesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  describe('filteredIssues()', () => {
    beforeEach(() => {
      component.issues.set([
        issue({ id: 1, title: 'login broken' }),
        issue({ id: 2, title: 'no permission', issueType: 'ANOMALY' }),
        issue({ id: 3, title: 'misc', archivedAt: '2026-09-19T08:00:00.000Z' })
      ]);
    });

    it('excludes archived but includes deleted', () => {
      expect(component.filteredIssues().map(i => i.id)).toEqual([1, 2]);
    });

    it('filters by text', () => {
      component.textFilter = 'login';
      expect(component.filteredIssues().map(i => i.id)).toEqual([1]);
    });

    it('filters by status and type NONE', () => {
      component.statusFilter = 'REPORTED';
      component.typeFilter = 'NONE';
      expect(component.filteredIssues().map(i => i.id)).toEqual([1]);
    });
  });

  describe('issuerOptions()', () => {
    it('returns user list when populated', () => {
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

  describe('load()', () => {
    it('stores issues on success', () => {
      currentProjectIdSignal.set(7);
      fixture.detectChanges();
      issuesApi.deletedIssues$.next([issue({ id: 1 }), issue({ id: 2 })]);
      issuesApi.deletedIssues$.complete();
      expect(component.issues().length).toBe(2);
      expect(component.loading()).toBe(false);
    });

    it('sets error on failure', () => {
      currentProjectIdSignal.set(7);
      fixture.detectChanges();
      issuesApi.deletedIssues$.error(new Error('boom'));
      expect(component.error()).toBe('Non riesco a caricare le segnalazioni eliminate.');
    });

    it('does nothing when no project', () => {
      expect(issuesApi.deletedIssues).not.toHaveBeenCalled();
    });
  });

  describe('confirmPermanentDelete()', () => {
    it('does nothing when no selection', () => {
      component.selected = [];
      component.confirmPermanentDelete();
      expect(confirmation.confirm).not.toHaveBeenCalled();
    });

    it('opens dialog with singular form for 1 item', () => {
      component.selected = [issue({ id: 1 })];
      component.confirmPermanentDelete();
      const opts = confirmation.confirm.mock.calls[0][0];
      expect(opts.message).toContain('1 segnalazione');
    });

    it('opens dialog with plural form for many items', () => {
      component.selected = [issue({ id: 1 }), issue({ id: 2 })];
      component.confirmPermanentDelete();
      const opts = confirmation.confirm.mock.calls[0][0];
      expect(opts.message).toContain('2 segnalazioni');
    });

    it('calls permanentlyDeleteIssues on accept', () => {
      component.selected = [issue({ id: 1 }), issue({ id: 2 })];
      component.confirmPermanentDelete();
      const opts = confirmation.confirm.mock.calls[0][0];
      opts.accept();
      expect(issuesApi.permanentlyDeleteIssues).toHaveBeenCalledWith([1, 2]);
    });
  });

  describe('permanentlyDelete()', () => {
    it('shows success message and reloads', () => {
      const addSpy = messageService.add;
      component.selected = [issue({ id: 1 })];
      component.confirmPermanentDelete();
      confirmation.confirm.mock.calls[0][0].accept();
      issuesApi.permanentlyDeleteIssues$.next();
      issuesApi.permanentlyDeleteIssues$.complete();
      expect(addSpy).toHaveBeenCalledWith(expect.objectContaining({ severity: 'success' }));
      expect(component.deleting()).toBe(false);
    });

    it('shows error message on failure', () => {
      const addSpy = messageService.add;
      component.selected = [issue({ id: 1 })];
      component.confirmPermanentDelete();
      confirmation.confirm.mock.calls[0][0].accept();
      issuesApi.permanentlyDeleteIssues$.error(new Error('boom'));
      expect(addSpy).toHaveBeenCalledWith(expect.objectContaining({ severity: 'error' }));
    });
  });

  describe('resetFilters()', () => {
    it('resets to defaults', () => {
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

  describe('back()', () => {
    it('navigates to dashboard', () => {
      const spy = jest.spyOn(router, 'navigateByUrl');
      component.back();
      expect(spy).toHaveBeenCalledWith('/dashboard');
    });
  });
});