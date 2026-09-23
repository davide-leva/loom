import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { signal } from '@angular/core';
import { Subject } from 'rxjs';
import { SegnalazioneDetailDialogComponent } from './segnalazione-detail-dialog.component';
import { SegnalazioniService } from '../../services/segnalazioni/segnalazioni.service';
import { AuthService } from '../../services/auth/auth.service';
import { LiveSyncService } from '../../services/live-sync/live-sync.service';
import type { CurrentUser } from '../../shared/models/auth.types';
import type { SegnalazioneAllegato, SegnalazioneCommento, SegnalazioneDettaglio, SegnalazioneCampo, SegnalazioneCampoOpzione, SegnalazioneSummary } from '../../shared/models/segnalazione.types';

class SegnalazioniStub {
  private issueDetailStream$ = new Subject<SegnalazioneDettaglio>();
  segnalazioneDettaglio = jest.fn(() => this.issueDetailStream$.asObservable());
  issueFields$ = new Subject<SegnalazioneCampo[]>();
  issueFields = jest.fn(() => this.issueFields$.asObservable());
  issueFieldOptions$ = new Subject<SegnalazioneCampoOpzione[]>();
  issueFieldOptions = jest.fn(() => this.issueFieldOptions$.asObservable());
  updateIssueValues$ = new Subject<SegnalazioneDettaglio>();
  updateIssueValues = jest.fn(() => this.updateIssueValues$.asObservable());
  approvaSegnalazione$ = new Subject<SegnalazioneSummary>();
  approvaSegnalazione = jest.fn(() => this.approvaSegnalazione$.asObservable());
  archiviaSegnalazione$ = new Subject<SegnalazioneSummary>();
  archiviaSegnalazione = jest.fn(() => this.archiviaSegnalazione$.asObservable());
  eliminaSegnalazione$ = new Subject<void>();
  eliminaSegnalazione = jest.fn(() => this.eliminaSegnalazione$.asObservable());
  addComment$ = new Subject<SegnalazioneCommento>();
  addComment = jest.fn(() => this.addComment$.asObservable());
  deleteComment$ = new Subject<void>();
  deleteComment = jest.fn(() => this.deleteComment$.asObservable());
  downloadAttachment$ = new Subject<Blob>();
  downloadAttachment = jest.fn(() => this.downloadAttachment$.asObservable());

  emitDetail(detail: SegnalazioneDettaglio): void { this.issueDetailStream$.next(detail); }
  emitDetailError(err: any): void { this.issueDetailStream$.error(err); }
  completeDetail(): void { this.issueDetailStream$.complete(); }

  /** Resets the detail stream so a new load() can be observed. */
  newDetailStream(): void { this.issueDetailStream$ = new Subject<SegnalazioneDettaglio>(); }
}

function userOf(role: string, id = 1): CurrentUser {
  return {
    id, username: 'mario', displayName: 'Mario', email: 'm@e.com',
    role, companyName: 'Acme', companyId: 10, primaryColor: 'blue',
    companyLogoUrl: null, internalCompanyName: 'Loom', internalLogoUrl: null
  } as CurrentUser;
}

function detail(issueOverrides: Partial<SegnalazioneSummary> = {}): SegnalazioneDettaglio {
  const issue: SegnalazioneSummary = {
    id: 1, projectId: 1, title: 'Title', description: 'Desc',
    createdAt: new Date(Date.now() - 1000 * 60).toISOString(), // 1 min ago
    status: 'REPORTED', issueType: 'ANOMALY',
    releasedAt: null, approvedAt: null,
    issuerUserId: 1, issuerUsername: 'mario',
    devUserId: null, devUsername: null,
    approveUserId: null, approveUsername: null,
    internal: false, deletedAt: null, archivedAt: null,
    selectValues: {},
    ...issueOverrides
  };
  return { issue, values: [], attachments: [], comments: [] };
}

describe('SegnalazioneDetailDialogComponent', () => {
  let fixture: ComponentFixture<SegnalazioneDetailDialogComponent>;
  let component: SegnalazioneDetailDialogComponent;
  let http: HttpTestingController;
  let segnalazioniApi: SegnalazioniStub;
  let userSignal: ReturnType<typeof signal<CurrentUser | null>>;
  let revisionSignal: ReturnType<typeof signal<number>>;
  let auth: { user: () => CurrentUser | null };
  let liveSync: { revision: () => number };

  beforeEach(async () => {
    segnalazioniApi = new SegnalazioniStub();
    userSignal = signal<CurrentUser | null>(null);
    revisionSignal = signal(0);
    auth = { user: () => userSignal() };
    liveSync = { revision: () => revisionSignal() };

    await TestBed.configureTestingModule({
      imports: [SegnalazioneDetailDialogComponent],
      providers: [
        provideAnimationsAsync('noop'),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: SegnalazioniService, useValue: segnalazioniApi },
        { provide: AuthService, useValue: auth },
        { provide: LiveSyncService, useValue: liveSync }
      ]
    }).compileComponents();

    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(SegnalazioneDetailDialogComponent);
    component = fixture.componentInstance;
    component.issueId = 1;
    component.ngOnInit();
  });

  afterEach(() => {
    http.verify();
  });

  describe('statusLabel / statusSeverity / typeLabel / fileSize', () => {
    it('maps status and type labels', () => {
      expect(component.statusLabel('REPORTED')).toBe('Segnalato');
      expect(component.typeLabel('ANOMALY')).toBe('Anomalia');
      expect(component.typeLabel(null)).toBe('Non categorizzata');
    });

    it('maps statusSeverity', () => {
      expect(component.statusSeverity('REPORTED')).toBe('info');
      expect(component.statusSeverity('APPROVED')).toBe('contrast');
    });

    it('formats file size as B / KB / MB', () => {
      expect(component.fileSize(500)).toBe('500 B');
      expect(component.fileSize(2048)).toBe('2.0 KB');
      expect(component.fileSize(1024 * 1024)).toBe('1.0 MB');
      expect(component.fileSize(20 * 1024 * 1024)).toBe('20 MB');
    });
  });

  describe('load() and revision refresh', () => {
    it('loads the issue detail and stores it', () => {
      const d = detail({ id: 1 });
      segnalazioniApi.emitDetail(d);
      expect(component.detail).toEqual(d);
    });

    it('triggers reload when revision changes and detail exists', () => {
      segnalazioniApi.emitDetail(detail());
      segnalazioniApi.segnalazioneDettaglio.mockClear();
      segnalazioniApi.newDetailStream();
      revisionSignal.set(1);
      fixture.detectChanges();
      expect(segnalazioniApi.segnalazioneDettaglio).toHaveBeenCalled();
    });

    it('emits issueDeleted and closed on 404 in refresh mode', () => {
      const deleteSpy = jest.fn();
      const closeSpy = jest.fn();
      component.issueDeleted.subscribe(deleteSpy);
      component.closed.subscribe(closeSpy);
      segnalazioniApi.emitDetail(detail());
      segnalazioniApi.newDetailStream();
      // Invoke refresh load directly to avoid effect timing.
      component.load(true);
      segnalazioniApi.emitDetailError(new HttpErrorResponse({ status: 404, statusText: 'Not Found' }));
      expect(deleteSpy).toHaveBeenCalledWith(1);
      expect(closeSpy).toHaveBeenCalled();
    });

    it('sets generic error on first load failure', () => {
      segnalazioniApi.emitDetailError(new HttpErrorResponse({ status: 500, statusText: 'Server Error' }));
      expect(component.error).toBe('Non riesco a caricare il dettaglio della segnalazione.');
    });
  });

  describe('permissions', () => {
    beforeEach(() => {
      segnalazioniApi.emitDetail(detail());
      segnalazioniApi.completeDetail();
    });

    it('canApprove(): only RELEASED + (SUPERUSER or internal ADMIN)', () => {
      component.detail = detail({ status: 'IN_PROGRESS' });
      userSignal.set(userOf('SUPERUSER'));
      expect(component.canApprove()).toBe(false);

      component.detail = detail({ status: 'RELEASED', internal: false });
      userSignal.set(userOf('ADMIN'));
      expect(component.canApprove()).toBe(false);

      component.detail = detail({ status: 'RELEASED', internal: true });
      userSignal.set(userOf('ADMIN'));
      expect(component.canApprove()).toBe(true);

      userSignal.set(userOf('SUPERUSER'));
      component.detail = detail({ status: 'RELEASED', internal: false });
      expect(component.canApprove()).toBe(true);
    });

    it('canArchive(): only ADMIN and APPROVED', () => {
      component.detail = detail({ status: 'APPROVED' });
      userSignal.set(userOf('USER'));
      expect(component.canArchive()).toBe(false);

      userSignal.set(userOf('ADMIN'));
      expect(component.canArchive()).toBe(true);

      component.detail = detail({ status: 'COMPLETED' });
      expect(component.canArchive()).toBe(false);
    });

    it('canEditAnyField(): TEAM or ADMIN or SUPERUSER', () => {
      userSignal.set(userOf('USER'));
      expect(component.canEditAnyField()).toBe(false);

      userSignal.set(userOf('TEAM'));
      expect(component.canEditAnyField()).toBe(true);

      userSignal.set(userOf('ADMIN'));
      expect(component.canEditAnyField()).toBe(true);

      userSignal.set(userOf('SUPERUSER'));
      expect(component.canEditAnyField()).toBe(true);
    });

    it('visibleFieldScopes() returns scopes by role (TEAM sees SUPERUSER read-only)', () => {
      userSignal.set(userOf('USER'));
      expect(component.visibleFieldScopes()).toEqual(['USER']);

      userSignal.set(userOf('TEAM'));
      expect(component.visibleFieldScopes()).toEqual(['USER', 'TEAM', 'SUPERUSER']);

      userSignal.set(userOf('ADMIN'));
      expect(component.visibleFieldScopes()).toEqual(['USER', 'TEAM', 'SUPERUSER']);

      userSignal.set(userOf('SUPERUSER'));
      expect(component.visibleFieldScopes()).toEqual(['USER', 'SUPERUSER']);
    });

    it('editableFieldScopes() excludes SUPERUSER for TEAM role', () => {
      userSignal.set(userOf('USER'));
      expect(component.editableFieldScopes()).toEqual(['USER']);

      userSignal.set(userOf('TEAM'));
      expect(component.editableFieldScopes()).toEqual(['USER', 'TEAM']);

      userSignal.set(userOf('ADMIN'));
      expect(component.editableFieldScopes()).toEqual(['USER', 'TEAM', 'SUPERUSER']);

      userSignal.set(userOf('SUPERUSER'));
      expect(component.editableFieldScopes()).toEqual(['USER', 'SUPERUSER']);
    });

    it('canDeleteIssue(): ADMIN always; issuer within 10 min', () => {
      userSignal.set(userOf('USER', 5));
      component.detail = detail({ issuerUserId: 5, createdAt: new Date(Date.now() - 1000 * 60).toISOString() });
      expect(component.canDeleteIssue()).toBe(true);

      component.detail = detail({ issuerUserId: 5, createdAt: new Date(Date.now() - 11 * 60 * 1000).toISOString() });
      expect(component.canDeleteIssue()).toBe(false);

      userSignal.set(userOf('ADMIN', 99));
      component.detail = detail({ issuerUserId: 5 });
      expect(component.canDeleteIssue()).toBe(true);
    });
  });

  describe('approve() / archiviaSegnalazione() / eliminaSegnalazione()', () => {
    beforeEach(() => {
      segnalazioniApi.emitDetail(detail({ status: 'RELEASED' }));
      segnalazioniApi.completeDetail();
      userSignal.set(userOf('ADMIN'));
    });

    it('approve() updates detail and emits issueChanged', () => {
      const changeSpy = jest.fn();
      component.issueChanged.subscribe(changeSpy);
      component.approve();
      const updated = { ...detail({ status: 'APPROVED' }).issue };
      segnalazioniApi.approvaSegnalazione$.next(updated);
      expect(component.detail!.issue.status).toBe('APPROVED');
      expect(changeSpy).toHaveBeenCalledWith(updated);
      expect(component.approving).toBe(false);
    });

    it('approve() sets error on failure', () => {
      component.approve();
      segnalazioniApi.approvaSegnalazione$.error(new Error('boom'));
      expect(component.error).toBe('Non riesco ad approvare la segnalazione.');
      expect(component.approving).toBe(false);
    });

    it('archiviaSegnalazione() updates detail and emits issueChanged', () => {
      const changeSpy = jest.fn();
      component.issueChanged.subscribe(changeSpy);
      component.archiviaSegnalazione();
      const updated = { ...detail({ status: 'ARCHIVED' }).issue, archivedAt: '2026-09-19T08:00:00.000Z' };
      segnalazioniApi.archiviaSegnalazione$.next(updated);
      expect(component.detail!.issue).toEqual(updated);
      expect(changeSpy).toHaveBeenCalledWith(updated);
    });

    it('archiviaSegnalazione() sets error on failure', () => {
      component.archiviaSegnalazione();
      segnalazioniApi.archiviaSegnalazione$.error(new Error('boom'));
      expect(component.error).toBe('Non riesco ad archiviare la segnalazione.');
    });

    it('eliminaSegnalazione() emits issueDeleted and closed on success', () => {
      const deleteSpy = jest.fn();
      const closeSpy = jest.fn();
      component.issueDeleted.subscribe(deleteSpy);
      component.closed.subscribe(closeSpy);
      component.eliminaSegnalazione();
      segnalazioniApi.eliminaSegnalazione$.next();
      expect(deleteSpy).toHaveBeenCalledWith(1);
      expect(closeSpy).toHaveBeenCalled();
      expect(component.deleting).toBe(false);
    });

    it('eliminaSegnalazione() sets error on failure', () => {
      component.eliminaSegnalazione();
      segnalazioniApi.eliminaSegnalazione$.error(new Error('boom'));
      expect(component.error).toBe('Non riesco a eliminare la segnalazione.');
      expect(component.deleting).toBe(false);
    });
  });

  describe('issue field editing', () => {
    beforeEach(() => {
      segnalazioniApi.emitDetail(detail());
      segnalazioniApi.completeDetail();
    });

    it('saveIssueFields() does nothing when user has no editable scopes', () => {
      userSignal.set(userOf('USER'));
      component.fieldsFormModel = { title: '', description: '', values: {}, attachments: {}, internal: false };
      component.saveIssueFields();
      expect(segnalazioniApi.updateIssueValues).not.toHaveBeenCalled();
    });

    it('fieldsValid() requires mandatory editable fields to be non-empty', () => {
      userSignal.set(userOf('ADMIN'));
      component.projectFields = [
        { id: 10, projectId: 1, code: 'SEV', label: 'Severity', description: null,
          mandatory: true, multiple: false, type: 'TEXT', scope: 'TEAM', hasValues: false }
      ];
      component.fieldsFormModel = { title: '', description: '', values: { 10: '' }, attachments: {}, internal: false };
      expect(component.fieldsValid()).toBe(false);

      component.fieldsFormModel.values[10] = 'HIGH';
      expect(component.fieldsValid()).toBe(true);
    });
  });

  describe('comments', () => {
    beforeEach(() => {
      segnalazioniApi.emitDetail(detail());
      segnalazioniApi.completeDetail();
    });

    it('addComment() ignores empty draft', () => {
      component.commentDraft = '   ';
      component.addComment();
      expect(segnalazioniApi.addComment).not.toHaveBeenCalled();
    });

    it('addComment() appends to detail comments on success', () => {
      component.commentDraft = '  Hello  ';
      component.addComment();
      expect(segnalazioniApi.addComment).toHaveBeenCalledWith(1, 'Hello');
      segnalazioniApi.addComment$.next({ id: 11, issueId: 1, projectId: 1, userId: 1, username: 'mario',
        date: '2026-09-19T08:00:00.000Z', comment: 'Hello', canDelete: false });
      expect(component.detail!.comments.length).toBe(1);
      expect(component.commentDraft).toBe('');
      expect(component.commentSaving).toBe(false);
    });

    it('addComment() sets error on failure', () => {
      component.commentDraft = 'Hello';
      component.addComment();
      segnalazioniApi.addComment$.error(new Error('boom'));
      expect(component.error).toBe('Non riesco a salvare il commento.');
    });

    it('deleteComment() removes the matching comment', () => {
      component.detail = { ...component.detail!, comments: [
        { id: 11, issueId: 1, projectId: 1, userId: 1, username: 'mario',
          date: '2026-09-19T08:00:00.000Z', comment: 'A', canDelete: true } as SegnalazioneCommento
      ]};
      component.deleteComment({ id: 11 } as SegnalazioneCommento);
      segnalazioniApi.deleteComment$.next();
      expect(component.detail!.comments.length).toBe(0);
    });

    it('deleteComment() sets error on failure', () => {
      component.detail = { ...component.detail!, comments: [
        { id: 11, issueId: 1, projectId: 1, userId: 1, username: 'mario',
          date: '2026-09-19T08:00:00.000Z', comment: 'A', canDelete: true } as SegnalazioneCommento
      ]};
      component.deleteComment({ id: 11 } as SegnalazioneCommento);
      segnalazioniApi.deleteComment$.error(new Error('boom'));
      expect(component.error).toBe('Non riesco a eliminare il commento.');
    });
  });

  describe('attachment preview', () => {
    it('isImage() detects image content types', () => {
      expect(component.isImage({ contentType: 'image/png' } as SegnalazioneAllegato)).toBe(true);
      expect(component.isImage({ contentType: null } as SegnalazioneAllegato)).toBe(false);
      expect(component.isImage({ contentType: 'application/pdf' } as SegnalazioneAllegato)).toBe(false);
    });

    it('downloadAttachment() triggers blob download for non-image', () => {
      const saveSpy = jest.spyOn(component as any, 'saveBlob').mockImplementation(() => true);
      const att = { id: 5, contentType: 'application/pdf', originalName: 'doc.pdf' } as SegnalazioneAllegato;
      component.download(att);
      segnalazioniApi.downloadAttachment$.next(new Blob(['x']));
      expect(saveSpy).toHaveBeenCalled();
    });
  });
});