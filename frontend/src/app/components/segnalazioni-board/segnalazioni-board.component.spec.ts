import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { Subject } from 'rxjs';
import { SegnalazioniBoardComponent } from './segnalazioni-board.component';
import { AuthService } from '../../services/auth/auth.service';
import { ProjectContextService } from '../../services/project-context/project-context.service';
import { SegnalazioniService } from '../../services/segnalazioni/segnalazioni.service';
import { LiveSyncService } from '../../services/live-sync/live-sync.service';
import { NotificheSegnalazioniService } from '../../services/notifiche-segnalazioni/notifiche-segnalazioni.service';
import type { CurrentUser } from '../../shared/models/auth.types';
import type { SegnalazioneSummary, ProjectUserSummary } from '../../shared/models/segnalazione.types';
import type { TipoSegnalazione } from '../../shared/models/segnalazione.types';

class SegnalazioniStub {
  segnalazioni$ = { subscribe: jest.fn() };
  segnalazioni = jest.fn(() => this.segnalazioni$);
  projectUsers$ = { subscribe: jest.fn() };
  projectUsers = jest.fn(() => this.projectUsers$);
  segnalazioneCampi$ = { subscribe: jest.fn() };
  segnalazioneCampi = jest.fn(() => this.segnalazioneCampi$);
  segnalazioneCampoOpzioni$ = { subscribe: jest.fn() };
  segnalazioneCampoOpzioni = jest.fn(() => this.segnalazioneCampoOpzioni$);
  updateStatus$ = new Subject<SegnalazioneSummary>();
  updateStatus = jest.fn(() => this.updateStatus$.asObservable());
  approvaSegnalazione$ = new Subject<SegnalazioneSummary>();
  approvaSegnalazione = jest.fn(() => this.approvaSegnalazione$.asObservable());
}

describe('SegnalazioniBoardComponent', () => {
  let fixture: ComponentFixture<SegnalazioniBoardComponent>;
  let component: SegnalazioniBoardComponent;
  let userSignal: ReturnType<typeof signal<CurrentUser | null>>;
  let currentProjectIdSignal: ReturnType<typeof signal<number | null>>;
  let revisionSignal: ReturnType<typeof signal<number>>;
  let auth: { user: () => CurrentUser | null };
  let projectContext: { currentProjectId: () => number | null; currentProject: () => any };
  let segnalazioniApi: SegnalazioniStub;
  let liveSync: { revision: () => number };
  let notifications: { isUnread: jest.Mock };

  function segnalazione(partial: Partial<SegnalazioneSummary>): SegnalazioneSummary {
    return {
      id: 1, projectId: 1, title: 'T', description: 'D',
      createdAt: '2026-09-19T08:00:00.000Z',
      status: 'REPORTED', issueType: 'ANOMALY' as TipoSegnalazione,
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
    revisionSignal = signal(0);

    auth = { user: () => userSignal() };
    projectContext = { currentProjectId: () => currentProjectIdSignal(), currentProject: () => null };
    segnalazioniApi = new SegnalazioniStub();
    liveSync = { revision: () => revisionSignal() };
    notifications = { isUnread: jest.fn(() => false) };

    await TestBed.configureTestingModule({
      imports: [SegnalazioniBoardComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: auth },
        { provide: ProjectContextService, useValue: projectContext },
        { provide: SegnalazioniService, useValue: segnalazioniApi },
        { provide: LiveSyncService, useValue: liveSync },
        { provide: NotificheSegnalazioniService, useValue: notifications },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              data: { issueType: 'ANOMALY' as TipoSegnalazione, title: 'Anomalie' },
              queryParamMap: convertToParamMap({})
            }
          }
        }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(SegnalazioniBoardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  describe('computed signals', () => {
    it('issueType() reads from route data', () => {
      expect(component.issueType()).toBe('ANOMALY');
    });

    it('title() reads from route data', () => {
      expect(component.title()).toBe('Anomalie');
    });

    it('issuerOptions() prepends Tutti and Non assegnato', () => {
      component.users.set([
        { id: 1, username: 'mario', firstName: null, lastName: null, role: 'USER' },
        { id: 2, username: 'team1', firstName: 'T', lastName: 'One', role: 'TEAM' }
      ]);
      const opts = component.issuerOptions();
      expect(opts[0].value).toBe('ALL');
      expect(opts[1].value).toBe('NONE');
      expect(opts.length).toBe(4);
    });

    it('developerOptions() includes TEAM and ADMIN users', () => {
      component.users.set([
        { id: 1, username: 'mario', firstName: null, lastName: null, role: 'USER' },
        { id: 2, username: 'team1', firstName: 'T', lastName: 'One', role: 'TEAM' },
        { id: 3, username: 'admin', firstName: null, lastName: null, role: 'ADMIN' }
      ]);
      const opts = component.developerOptions();
      const labels = opts.map(o => o.label);
      expect(opts.map(o => o.value)).toEqual(['ALL', 'NONE', 2, 3]);
      expect(labels).toEqual(['Tutti', 'Non assegnato', 'T One', 'admin']);
    });
  });

  describe('segnalazioniFiltrate()', () => {
    it('returns only issues matching the kanban type', () => {
      component.segnalazioni.set([
        segnalazione({ id: 1, issueType: 'ANOMALY' }),
        segnalazione({ id: 2, issueType: 'IMPROVEMENT' })
      ]);
      const filtered = component.segnalazioniFiltrate();
      expect(filtered.map(i => i.id)).toEqual([1]);
    });

    it('applies issuer, developer, text, and select filters together', () => {
      component.segnalazioni.set([
        segnalazione({ id: 1, title: 'login bug', issueType: 'ANOMALY', issuerUserId: 7, devUserId: 20 }),
        segnalazione({ id: 2, title: 'feature', issueType: 'ANOMALY', issuerUserId: 8, devUserId: 20 })
      ]);
      component.textFilter = 'login';
      component.issuerFilter = 7;
      component.developerFilter = 20;
      expect(component.segnalazioniFiltrate().map(i => i.id)).toEqual([1]);
    });
  });

  describe('issuesByStatus()', () => {
    it('groups issues into the right column', () => {
      component.segnalazioni.set([
        segnalazione({ id: 1, status: 'REPORTED' }),
        segnalazione({ id: 2, status: 'IN_PROGRESS' }),
        segnalazione({ id: 3, status: 'COMPLETED' })
      ]);
      expect(component.issuesByStatus('REPORTED').map(i => i.id)).toEqual([1]);
      expect(component.issuesByStatus('IN_PROGRESS').map(i => i.id)).toEqual([2]);
      expect(component.issuesByStatus('COMPLETED').map(i => i.id)).toEqual([3]);
      expect(component.issuesByStatus('RELEASED')).toEqual([]);
    });
  });

  describe('resetFilters()', () => {
    it('clears all filter fields', () => {
      component.textFilter = 'x';
      component.issuerFilter = 7;
      component.developerFilter = 'NONE';
      component.dateRange = [new Date(), new Date()];
      component.selectFilterValues = { 1: ['a'] };

      component.resetFilters();

      expect(component.textFilter).toBe('');
      expect(component.issuerFilter).toBe('ALL');
      expect(component.developerFilter).toBe('ALL');
      expect(component.dateRange).toBeNull();
      expect(component.selectFilterValues).toEqual({});
    });
  });

  describe('dropOnStatus()', () => {
    it('does nothing quando la segnalazione trascinata ha già lo stato target', () => {
      component.startDrag(segnalazione({ id: 1, status: 'REPORTED' }));
      component.dropOnStatus('REPORTED');
      expect(segnalazioniApi.updateStatus).not.toHaveBeenCalled();
    });

    it('blocks non-TEAM non-ADMIN from changing status', () => {
      userSignal.set({ ...userSignal(), id: 7 } as CurrentUser);
      component.startDrag(segnalazione({ id: 1, status: 'REPORTED' }));
      component.dropOnStatus('IN_PROGRESS');
      expect(component.error()).toBe('Solo il team o un admin può cambiare lo stato della segnalazione.');
      expect(segnalazioniApi.updateStatus).not.toHaveBeenCalled();
    });

    it('sends updateStatus and aggiorna la segnalazione in caso di successo', () => {
      userSignal.set({ ...userSignal(), id: 7, role: 'TEAM' } as CurrentUser);
      component.segnalazioni.set([segnalazione({ id: 1, status: 'REPORTED' })]);
      component.startDrag(segnalazione({ id: 1, status: 'REPORTED' }));
      component.dropOnStatus('IN_PROGRESS');
      expect(segnalazioniApi.updateStatus).toHaveBeenCalledWith(1, 'IN_PROGRESS');
      expect(component.segnalazioni()[0].status).toBe('IN_PROGRESS');

      segnalazioniApi.updateStatus$.next(segnalazione({ id: 1, status: 'IN_PROGRESS' }));
      expect(component.savingIssueId()).toBeNull();
    });

    it('reverts on error', () => {
      userSignal.set({ ...userSignal(), id: 7, role: 'TEAM' } as CurrentUser);
      component.segnalazioni.set([segnalazione({ id: 1, status: 'REPORTED' })]);
      component.startDrag(segnalazione({ id: 1, status: 'REPORTED' }));
      component.dropOnStatus('IN_PROGRESS');
      segnalazioniApi.updateStatus$.error(new Error('boom'));
      expect(component.segnalazioni()[0].status).toBe('REPORTED');
      expect(component.error()).toBe('Non riesco a salvare il cambio stato.');
    });

    it('blocks non-released issues from going to APPROVED', () => {
      userSignal.set({ ...userSignal(), id: 7, role: 'SUPERUSER' } as CurrentUser);
      component.segnalazioni.set([segnalazione({ id: 1, status: 'COMPLETED' })]);
      component.startDrag(segnalazione({ id: 1, status: 'COMPLETED' }));
      component.dropOnStatus('APPROVED');
      expect(component.error()).toBe('Solo le segnalazioni rilasciate possono essere approvate.');
      expect(segnalazioniApi.approvaSegnalazione).not.toHaveBeenCalled();
    });

    it('lets the USER author drag a released issue to APPROVED using the approval endpoint', () => {
      userSignal.set({ id: 7, role: 'USER' } as CurrentUser);
      const ownIssue = segnalazione({ status: 'RELEASED', issuerUserId: 7 });
      component.segnalazioni.set([ownIssue]);
      component.startDrag(ownIssue);
      component.dropOnStatus('APPROVED');
      expect(segnalazioniApi.approvaSegnalazione).toHaveBeenCalledWith(1);
      expect(segnalazioniApi.updateStatus).not.toHaveBeenCalled();
      expect(component.segnalazioni()[0].status).toBe('APPROVED');
      const approved = segnalazione({ status: 'APPROVED', issuerUserId: 7,
        approveUserId: 7, approvedAt: '2026-10-28T12:00:00Z' });
      segnalazioniApi.approvaSegnalazione$.next(approved);
      expect(component.segnalazioni()[0]).toEqual(approved);
      expect(component.savingIssueId()).toBeNull();
    });

    it.each([8, null])('blocks USER approval when the issuer is %s', issuerUserId => {
      userSignal.set({ id: 7, role: 'USER' } as CurrentUser);
      const issue = segnalazione({ status: 'RELEASED', issuerUserId });
      component.segnalazioni.set([issue]);
      component.startDrag(issue);
      component.dropOnStatus('APPROVED');
      expect(segnalazioniApi.approvaSegnalazione).not.toHaveBeenCalled();
      expect(segnalazioniApi.updateStatus).not.toHaveBeenCalled();
      expect(component.segnalazioni()[0].status).toBe('RELEASED');
      expect(component.error()).toBeTruthy();
    });

    it.each(['REPORTED', 'IN_PROGRESS', 'COMPLETED'] as const)(
      'blocks the USER author from approving an issue in %s', status => {
        userSignal.set({ id: 7, role: 'USER' } as CurrentUser);
        component.startDrag(segnalazione({ status, issuerUserId: 7 }));
        component.dropOnStatus('APPROVED');
        expect(component.error()).toBe('Solo le segnalazioni rilasciate possono essere approvate.');
        expect(segnalazioniApi.approvaSegnalazione).not.toHaveBeenCalled();
      });

    it('keeps other status transitions forbidden for the USER author', () => {
      userSignal.set({ id: 7, role: 'USER' } as CurrentUser);
      component.startDrag(segnalazione({ status: 'RELEASED', issuerUserId: 7 }));
      component.dropOnStatus('COMPLETED');
      expect(segnalazioniApi.updateStatus).not.toHaveBeenCalled();
      expect(segnalazioniApi.approvaSegnalazione).not.toHaveBeenCalled();
    });

    it('restores RELEASED when approval of the USER authors issue fails', () => {
      userSignal.set({ id: 7, role: 'USER' } as CurrentUser);
      const issue = segnalazione({ status: 'RELEASED', issuerUserId: 7 });
      component.segnalazioni.set([issue]);
      component.startDrag(issue);
      component.dropOnStatus('APPROVED');
      segnalazioniApi.approvaSegnalazione$.error(new Error('Forbidden'));
      expect(component.segnalazioni()[0].status).toBe('RELEASED');
      expect(component.savingIssueId()).toBeNull();
      expect(component.error()).toBe('Non riesco a salvare il cambio stato.');
    });

    it.each([
      { role: 'ADMIN', internal: true, allowed: true },
      { role: 'ADMIN', internal: false, allowed: false },
      { role: 'TEAM', internal: true, allowed: false }
    ] as const)('preserves approval permissions for $role with internal=$internal', ({ role, internal, allowed }) => {
      userSignal.set({ id: 7, role } as CurrentUser);
      component.startDrag(segnalazione({ status: 'RELEASED', issuerUserId: 7, internal }));
      component.dropOnStatus('APPROVED');
      expect(segnalazioniApi.approvaSegnalazione).toHaveBeenCalledTimes(allowed ? 1 : 0);
      expect(segnalazioniApi.updateStatus).not.toHaveBeenCalled();
    });

    it('approves via approvaSegnalazione when SUPERUSER moves RELEASED → APPROVED', () => {
      userSignal.set({ ...userSignal(), id: 7, role: 'SUPERUSER' } as CurrentUser);
      component.segnalazioni.set([segnalazione({ id: 1, status: 'RELEASED' })]);
      component.startDrag(segnalazione({ id: 1, status: 'RELEASED' }));
      component.dropOnStatus('APPROVED');
      expect(segnalazioniApi.approvaSegnalazione).toHaveBeenCalledWith(1);
      segnalazioniApi.approvaSegnalazione$.next(segnalazione({ id: 1, status: 'APPROVED' }));
      expect(component.savingIssueId()).toBeNull();
    });
  });

  describe('statusLabel / statusSeverity / typeLabel', () => {
    it('statusLabel returns italian labels', () => {
      expect(component.statusLabel('REPORTED')).toBe('Segnalato');
      expect(component.statusLabel('COMPLETED')).toBe('Completato');
    });

    it('typeLabel returns italian labels', () => {
      expect(component.typeLabel('ANOMALY')).toBe('Anomalia');
      expect(component.typeLabel('IMPLEMENTATION')).toBe('Implementazione');
    });

    it('statusSeverity maps to severity levels', () => {
      expect(component.statusSeverity('REPORTED')).toBe('info');
      expect(component.statusSeverity('APPROVED')).toBe('contrast');
    });
  });
});
