import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { ConfirmationService, MessageService } from 'primeng/api';
import { signal } from '@angular/core';
import { Subject } from 'rxjs';
import { SegnalazioniEliminateComponent } from './segnalazioni-eliminate.component';
import { SegnalazioniService } from '../../services/segnalazioni/segnalazioni.service';
import { ProjectContextService } from '../../services/project-context/project-context.service';
import { LiveSyncService } from '../../services/live-sync/live-sync.service';
import type { SegnalazioneSummary } from '../../shared/models/segnalazione.types';

class SegnalazioniStub {
  segnalazioniEliminate$ = new Subject<SegnalazioneSummary[]>();
  segnalazioniEliminate = jest.fn(() => this.segnalazioniEliminate$.asObservable());
  eliminaDefinitivamenteSegnalazioni$ = new Subject<void>();
  eliminaDefinitivamenteSegnalazioni = jest.fn(() => this.eliminaDefinitivamenteSegnalazioni$.asObservable());
}

function segnalazione(partial: Partial<SegnalazioneSummary>): SegnalazioneSummary {
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
  } as SegnalazioneSummary;
}

describe('SegnalazioniEliminateComponent', () => {
  let fixture: ComponentFixture<SegnalazioniEliminateComponent>;
  let component: SegnalazioniEliminateComponent;
  let router: Router;
  let segnalazioniApi: SegnalazioniStub;
  let currentProjectIdSignal: ReturnType<typeof signal<number | null>>;
  let revisionSignal: ReturnType<typeof signal<number>>;
  let confirmation: { confirm: jest.Mock; requireConfirmation$: Subject<any> };
  let messageService: { add: jest.Mock; messageObserver: Subject<any>; clearObserver: Subject<any> };

  beforeEach(async () => {
    segnalazioniApi = new SegnalazioniStub();
    currentProjectIdSignal = signal<number | null>(null);
    revisionSignal = signal(0);
    confirmation = { confirm: jest.fn(), requireConfirmation$: new Subject() };
    messageService = { add: jest.fn(), messageObserver: new Subject(), clearObserver: new Subject() };

    await TestBed.configureTestingModule({
      imports: [SegnalazioniEliminateComponent],
      providers: [
        provideRouter([]),
        provideAnimationsAsync('noop'),
        ConfirmationService,
        MessageService,
        { provide: SegnalazioniService, useValue: segnalazioniApi },
        { provide: ProjectContextService, useValue: { currentProjectId: () => currentProjectIdSignal(), currentProject: () => null } },
        { provide: LiveSyncService, useValue: { revision: () => revisionSignal() } }
      ]
    })
    .overrideComponent(SegnalazioniEliminateComponent, {
      set: { providers: [
        { provide: ConfirmationService, useValue: confirmation },
        { provide: MessageService, useValue: messageService }
      ] }
    })
    .compileComponents();

    router = TestBed.inject(Router);
    fixture = TestBed.createComponent(SegnalazioniEliminateComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  describe('segnalazioniFiltrate()', () => {
    beforeEach(() => {
      component.segnalazioni.set([
        segnalazione({ id: 1, title: 'login broken' }),
        segnalazione({ id: 2, title: 'no permission', issueType: 'ANOMALY' }),
        segnalazione({ id: 3, title: 'misc', archivedAt: '2026-09-19T08:00:00.000Z' })
      ]);
    });

    it('excludes archived but includes deleted', () => {
      expect(component.segnalazioniFiltrate().map(i => i.id)).toEqual([1, 2]);
    });

    it('filters by text', () => {
      component.textFilter = 'login';
      expect(component.segnalazioniFiltrate().map(i => i.id)).toEqual([1]);
    });

    it('filters by status and type NONE', () => {
      component.statusFilter = 'REPORTED';
      component.typeFilter = 'NONE';
      expect(component.segnalazioniFiltrate().map(i => i.id)).toEqual([1]);
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
      segnalazioniApi.segnalazioniEliminate$.next([segnalazione({ id: 1 }), segnalazione({ id: 2 })]);
      segnalazioniApi.segnalazioniEliminate$.complete();
      expect(component.segnalazioni().length).toBe(2);
      expect(component.loading()).toBe(false);
    });

    it('sets error on failure', () => {
      currentProjectIdSignal.set(7);
      fixture.detectChanges();
      segnalazioniApi.segnalazioniEliminate$.error(new Error('boom'));
      expect(component.error()).toBe('Non riesco a caricare le segnalazioni eliminate.');
    });

    it('does nothing when no project', () => {
      expect(segnalazioniApi.segnalazioniEliminate).not.toHaveBeenCalled();
    });
  });

  describe('confirmPermanentDelete()', () => {
    it('does nothing when no selection', () => {
      component.selected = [];
      component.confirmPermanentDelete();
      expect(confirmation.confirm).not.toHaveBeenCalled();
    });

    it('opens dialog with singular form for 1 item', () => {
      component.selected = [segnalazione({ id: 1 })];
      component.confirmPermanentDelete();
      const opts = confirmation.confirm.mock.calls[0][0];
      expect(opts.message).toContain('1 segnalazione');
    });

    it('opens dialog with plural form for many items', () => {
      component.selected = [segnalazione({ id: 1 }), segnalazione({ id: 2 })];
      component.confirmPermanentDelete();
      const opts = confirmation.confirm.mock.calls[0][0];
      expect(opts.message).toContain('2 segnalazioni');
    });

    it('calls eliminaDefinitivamenteSegnalazioni on accept', () => {
      component.selected = [segnalazione({ id: 1 }), segnalazione({ id: 2 })];
      component.confirmPermanentDelete();
      const opts = confirmation.confirm.mock.calls[0][0];
      opts.accept();
      expect(segnalazioniApi.eliminaDefinitivamenteSegnalazioni).toHaveBeenCalledWith([1, 2]);
    });
  });

  describe('permanentlyDelete()', () => {
    it('shows success message and reloads', () => {
      const addSpy = messageService.add;
      component.selected = [segnalazione({ id: 1 })];
      component.confirmPermanentDelete();
      confirmation.confirm.mock.calls[0][0].accept();
      segnalazioniApi.eliminaDefinitivamenteSegnalazioni$.next();
      segnalazioniApi.eliminaDefinitivamenteSegnalazioni$.complete();
      expect(addSpy).toHaveBeenCalledWith(expect.objectContaining({ severity: 'success' }));
      expect(component.deleting()).toBe(false);
    });

    it('shows error message on failure', () => {
      const addSpy = messageService.add;
      component.selected = [segnalazione({ id: 1 })];
      component.confirmPermanentDelete();
      confirmation.confirm.mock.calls[0][0].accept();
      segnalazioniApi.eliminaDefinitivamenteSegnalazioni$.error(new Error('boom'));
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