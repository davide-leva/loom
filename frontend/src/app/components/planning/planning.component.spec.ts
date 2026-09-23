import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { signal } from '@angular/core';
import { Subject } from 'rxjs';
import { PlanningComponent } from './planning.component';
import { SegnalazioniService } from '../../services/segnalazioni/segnalazioni.service';
import { ProjectContextService } from '../../services/project-context/project-context.service';
import { LiveSyncService } from '../../services/live-sync/live-sync.service';
import { NotificheSegnalazioniService } from '../../services/notifiche-segnalazioni/notifiche-segnalazioni.service';
import type { SegnalazioneSummary, ProjectUserSummary } from '../../shared/models/segnalazione.types';

class SegnalazioniStub {
  segnalazioni$ = new Subject<SegnalazioneSummary[]>();
  segnalazioni = jest.fn(() => this.segnalazioni$.asObservable());
  projectUsers$ = new Subject<ProjectUserSummary[]>();
  projectUsers = jest.fn(() => this.projectUsers$.asObservable());
  aggiornaPianificazione$ = new Subject<SegnalazioneSummary>();
  aggiornaPianificazione = jest.fn(() => this.aggiornaPianificazione$.asObservable());
}

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

describe('PlanningComponent', () => {
  let fixture: ComponentFixture<PlanningComponent>;
  let component: PlanningComponent;
  let router: Router;
  let segnalazioniApi: SegnalazioniStub;
  let currentProjectIdSignal: ReturnType<typeof signal<number | null>>;
  let revisionSignal: ReturnType<typeof signal<number>>;
  let projectContext: { currentProjectId: () => number | null; currentProject: () => any };
  let liveSync: { revision: () => number };
  let notifications: { isUnread: jest.Mock };

  beforeEach(async () => {
    segnalazioniApi = new SegnalazioniStub();
    currentProjectIdSignal = signal<number | null>(null);
    revisionSignal = signal(0);
    projectContext = {
      currentProjectId: () => currentProjectIdSignal(),
      currentProject: () => null
    };
    liveSync = { revision: () => revisionSignal() };
    notifications = { isUnread: jest.fn(() => false) };

    await TestBed.configureTestingModule({
      imports: [PlanningComponent],
      providers: [
        provideRouter([]),
        provideAnimationsAsync('noop'),
        { provide: SegnalazioniService, useValue: segnalazioniApi },
        { provide: ProjectContextService, useValue: projectContext },
        { provide: LiveSyncService, useValue: liveSync },
        { provide: NotificheSegnalazioniService, useValue: notifications }
      ]
    }).compileComponents();

    router = TestBed.inject(Router);
    fixture = TestBed.createComponent(PlanningComponent);
    component = fixture.componentInstance;
  });

  describe('columns and grouping', () => {
    beforeEach(() => fixture.detectChanges());

    it('issuesFor() filters by status=REPORTED and column type, sorted by createdAt asc', () => {
      component.segnalazioni.set([
        segnalazione({ id: 1, createdAt: '2026-09-19T10:00:00.000Z', issueType: 'ANOMALY' }),
        segnalazione({ id: 2, createdAt: '2026-09-19T08:00:00.000Z', issueType: 'ANOMALY' }),
        segnalazione({ id: 3, createdAt: '2026-09-19T09:00:00.000Z', issueType: 'ANOMALY', status: 'IN_PROGRESS' }),
        segnalazione({ id: 4, createdAt: '2026-09-19T11:00:00.000Z', issueType: 'IMPROVEMENT' })
      ]);

      const col = component.columns.find(c => c.type === 'ANOMALY')!;
      const ids = component.issuesFor(col).map(i => i.id);
      expect(ids).toEqual([2, 1]); // #3 excluded because status!=REPORTED; sorted asc
    });

    it('issuesFor() uncategorized column has issues with null type', () => {
      component.segnalazioni.set([
        segnalazione({ id: 1, issueType: null }),
        segnalazione({ id: 2, issueType: 'ANOMALY' })
      ]);

      const col = component.columns.find(c => c.type === null)!;
      const ids = component.issuesFor(col).map(i => i.id);
      expect(ids).toEqual([1]);
    });
  });

  describe('developerOptions', () => {
    it('builds the options list after load', () => {
      fixture.detectChanges();
      currentProjectIdSignal.set(5);
      fixture.detectChanges();

      const users: ProjectUserSummary[] = [
        { id: 1, username: 'mario', firstName: 'Mario', lastName: 'Rossi', role: 'TEAM' },
        { id: 2, username: 'anna', firstName: null, lastName: null, role: 'USER' },
        { id: 3, username: 'admin', firstName: null, lastName: null, role: 'ADMIN' }
      ];
      segnalazioniApi.segnalazioni$.next([]);
      segnalazioniApi.segnalazioni$.complete();
      segnalazioniApi.projectUsers$.next(users);
      segnalazioniApi.projectUsers$.complete();

      expect(component.developerOptions[0]).toEqual({ label: 'Non assegnato', value: null });
      const labels = component.developerOptions.map(o => o.label);
      // TEAM users get formatted as "username · Full Name"; ADMIN appears as "name" only (no role TEAM)
      expect(labels).toContain('mario · Mario Rossi');
      expect(labels).not.toContain('anna');
      expect(labels).not.toContain('admin');
    });
  });

  describe('dropOnColumn()', () => {
    beforeEach(() => fixture.detectChanges());

    it('does nothing when target column is uncategorized', () => {
      component.startDrag(segnalazione({ id: 1, issueType: null }));
      const col = component.columns.find(c => c.type === null)!;
      component.dropOnColumn(col);
      expect(segnalazioniApi.aggiornaPianificazione).not.toHaveBeenCalled();
    });

    it('does nothing quando la segnalazione è gia nella colonna corretta', () => {
      component.startDrag(segnalazione({ id: 1, issueType: 'ANOMALY' }));
      const col = component.columns.find(c => c.type === 'ANOMALY')!;
      component.dropOnColumn(col);
      expect(segnalazioniApi.aggiornaPianificazione).not.toHaveBeenCalled();
    });

    it('does nothing quando non c e una segnalazione trascinata', () => {
      const col = component.columns.find(c => c.type === 'ANOMALY')!;
      component.dropOnColumn(col);
      expect(segnalazioniApi.aggiornaPianificazione).not.toHaveBeenCalled();
    });

    it('calls aggiornaPianificazione with the new type on drop', () => {
      component.segnalazioni.set([segnalazione({ id: 1, issueType: null })]);
      component.startDrag(segnalazione({ id: 1, issueType: null, devUserId: null }));
      const col = component.columns.find(c => c.type === 'ANOMALY')!;
      component.dropOnColumn(col);
      expect(segnalazioniApi.aggiornaPianificazione).toHaveBeenCalledWith(1, 'ANOMALY', null);
      expect(component.segnalazioni()[0].issueType).toBe('ANOMALY');

      segnalazioniApi.aggiornaPianificazione$.next(segnalazione({ id: 1, issueType: 'ANOMALY' }));
      expect(component.savingIssueId()).toBeNull();
    });

    it('ripristina la segnalazione in caso di errore', () => {
      component.segnalazioni.set([segnalazione({ id: 1, issueType: null, devUserId: null, devUsername: null })]);
      component.startDrag(segnalazione({ id: 1, issueType: null, devUserId: null }));
      const col = component.columns.find(c => c.type === 'ANOMALY')!;
      component.dropOnColumn(col);
      segnalazioniApi.aggiornaPianificazione$.error(new Error('boom'));
      expect(component.segnalazioni()[0].issueType).toBeNull();
      expect(component.error()).toBe('Non riesco a salvare la pianificazione.');
    });
  });

  describe('setDeveloper()', () => {
    beforeEach(() => fixture.detectChanges());

    it('updates optimistically quando la segnalazione non ha ancora una tipologia', () => {
      component.segnalazioni.set([segnalazione({ id: 1, issueType: null, devUserId: null, devUsername: null })]);
      component.users.set([{ id: 5, username: 'team1', firstName: null, lastName: null, role: 'TEAM' }]);
      component.setDeveloper(component.segnalazioni()[0], 5);
      expect(segnalazioniApi.aggiornaPianificazione).not.toHaveBeenCalled();
      expect(component.segnalazioni()[0].devUserId).toBe(5);
    });

    it('updates devUsername via savePlanning when type is set', () => {
      component.segnalazioni.set([segnalazione({ id: 1, issueType: 'ANOMALY', devUserId: null, devUsername: null })]);
      component.users.set([{ id: 5, username: 'team1', firstName: null, lastName: null, role: 'TEAM' }]);
      component.setDeveloper(component.segnalazioni()[0], 5);
      expect(component.segnalazioni()[0].devUsername).toBe('team1');
    });

    it('persists via API quando la segnalazione ha una tipologia', () => {
      component.segnalazioni.set([segnalazione({ id: 1, issueType: 'ANOMALY', devUserId: null, devUsername: null })]);
      component.users.set([{ id: 5, username: 'team1', firstName: null, lastName: null, role: 'TEAM' }]);
      component.setDeveloper(component.segnalazioni()[0], 5);
      expect(segnalazioniApi.aggiornaPianificazione).toHaveBeenCalledWith(1, 'ANOMALY', 5);
    });
  });

  describe('navigation', () => {
    beforeEach(() => fixture.detectChanges());

    it('openDetail() sets segnalazioneSelezionataId', () => {
      component.openDetail({ id: 7 } as SegnalazioneSummary);
      expect(component.segnalazioneSelezionataId).toBe(7);
    });

    it('onSegnalazioneModificata() sostituisce la segnalazione corrispondente', () => {
      component.segnalazioni.set([segnalazione({ id: 1 })]);
      component.onSegnalazioneModificata(segnalazione({ id: 1, title: 'updated' }));
      expect(component.segnalazioni()[0].title).toBe('updated');
    });

    it('onSegnalazioneEliminata() rimuove la segnalazione corrispondente', () => {
      component.segnalazioni.set([segnalazione({ id: 1 }), segnalazione({ id: 2 })]);
      component.onSegnalazioneEliminata(1);
      expect(component.segnalazioni().map(i => i.id)).toEqual([2]);
    });
  });
});