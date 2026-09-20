import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { signal } from '@angular/core';
import { Subject } from 'rxjs';
import { IssueDetailDialogComponent } from './issue-detail-dialog.component';
import { IssuesService } from '../../services/issues/issues.service';
import { AuthService } from '../../services/auth/auth.service';
import { LiveSyncService } from '../../services/live-sync/live-sync.service';
import type { CurrentUser } from '../../shared/models/auth.types';
import type { IssueAttachment, IssueComment, IssueDetail, IssueField, IssueFieldOption, IssueSummary } from '../../shared/models/issue.types';

class IssuesStub {
  private issueDetailStream$ = new Subject<IssueDetail>();
  issueDetail = jest.fn(() => this.issueDetailStream$.asObservable());
  issueFields$ = new Subject<IssueField[]>();
  issueFields = jest.fn(() => this.issueFields$.asObservable());
  issueFieldOptions$ = new Subject<IssueFieldOption[]>();
  issueFieldOptions = jest.fn(() => this.issueFieldOptions$.asObservable());
  updateIssueValues$ = new Subject<IssueDetail>();
  updateIssueValues = jest.fn(() => this.updateIssueValues$.asObservable());
  approveIssue$ = new Subject<IssueSummary>();
  approveIssue = jest.fn(() => this.approveIssue$.asObservable());
  archiveIssue$ = new Subject<IssueSummary>();
  archiveIssue = jest.fn(() => this.archiveIssue$.asObservable());
  deleteIssue$ = new Subject<void>();
  deleteIssue = jest.fn(() => this.deleteIssue$.asObservable());
  addComment$ = new Subject<IssueComment>();
  addComment = jest.fn(() => this.addComment$.asObservable());
  deleteComment$ = new Subject<void>();
  deleteComment = jest.fn(() => this.deleteComment$.asObservable());
  downloadAttachment$ = new Subject<Blob>();
  downloadAttachment = jest.fn(() => this.downloadAttachment$.asObservable());

  emitDetail(detail: IssueDetail): void { this.issueDetailStream$.next(detail); }
  emitDetailError(err: any): void { this.issueDetailStream$.error(err); }
  completeDetail(): void { this.issueDetailStream$.complete(); }

  /** Resets the detail stream so a new load() can be observed. */
  newDetailStream(): void { this.issueDetailStream$ = new Subject<IssueDetail>(); }
}

function userOf(role: string, id = 1): CurrentUser {
  return {
    id, username: 'mario', displayName: 'Mario', email: 'm@e.com',
    role, companyName: 'Acme', companyId: 10, primaryColor: 'blue',
    companyLogoUrl: null, internalCompanyName: 'Tickets', internalLogoUrl: null
  } as CurrentUser;
}

function detail(issueOverrides: Partial<IssueSummary> = {}): IssueDetail {
  const issue: IssueSummary = {
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

describe('IssueDetailDialogComponent', () => {
  let fixture: ComponentFixture<IssueDetailDialogComponent>;
  let component: IssueDetailDialogComponent;
  let http: HttpTestingController;
  let issuesApi: IssuesStub;
  let userSignal: ReturnType<typeof signal<CurrentUser | null>>;
  let revisionSignal: ReturnType<typeof signal<number>>;
  let auth: { user: () => CurrentUser | null };
  let liveSync: { revision: () => number };

  beforeEach(async () => {
    issuesApi = new IssuesStub();
    userSignal = signal<CurrentUser | null>(null);
    revisionSignal = signal(0);
    auth = { user: () => userSignal() };
    liveSync = { revision: () => revisionSignal() };

    await TestBed.configureTestingModule({
      imports: [IssueDetailDialogComponent],
      providers: [
        provideAnimationsAsync('noop'),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: IssuesService, useValue: issuesApi },
        { provide: AuthService, useValue: auth },
        { provide: LiveSyncService, useValue: liveSync }
      ]
    }).compileComponents();

    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(IssueDetailDialogComponent);
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
      issuesApi.emitDetail(d);
      expect(component.detail).toEqual(d);
    });

    it('triggers reload when revision changes and detail exists', () => {
      issuesApi.emitDetail(detail());
      issuesApi.issueDetail.mockClear();
      issuesApi.newDetailStream();
      revisionSignal.set(1);
      fixture.detectChanges();
      expect(issuesApi.issueDetail).toHaveBeenCalled();
    });

    it('emits issueDeleted and closed on 404 in refresh mode', () => {
      const deleteSpy = jest.fn();
      const closeSpy = jest.fn();
      component.issueDeleted.subscribe(deleteSpy);
      component.closed.subscribe(closeSpy);
      issuesApi.emitDetail(detail());
      issuesApi.newDetailStream();
      // Invoke refresh load directly to avoid effect timing.
      component.load(true);
      issuesApi.emitDetailError(new HttpErrorResponse({ status: 404, statusText: 'Not Found' }));
      expect(deleteSpy).toHaveBeenCalledWith(1);
      expect(closeSpy).toHaveBeenCalled();
    });

    it('sets generic error on first load failure', () => {
      issuesApi.emitDetailError(new HttpErrorResponse({ status: 500, statusText: 'Server Error' }));
      expect(component.error).toBe('Non riesco a caricare il dettaglio issue.');
    });
  });

  describe('permissions', () => {
    beforeEach(() => {
      issuesApi.emitDetail(detail());
      issuesApi.completeDetail();
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

    it('canEditTeamFields(): TEAM or ADMIN', () => {
      userSignal.set(userOf('USER'));
      expect(component.canEditTeamFields()).toBe(false);

      userSignal.set(userOf('TEAM'));
      expect(component.canEditTeamFields()).toBe(true);

      userSignal.set(userOf('ADMIN'));
      expect(component.canEditTeamFields()).toBe(true);
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

  describe('approve() / archiveIssue() / deleteIssue()', () => {
    beforeEach(() => {
      issuesApi.emitDetail(detail({ status: 'RELEASED' }));
      issuesApi.completeDetail();
      userSignal.set(userOf('ADMIN'));
    });

    it('approve() updates detail and emits issueChanged', () => {
      const changeSpy = jest.fn();
      component.issueChanged.subscribe(changeSpy);
      component.approve();
      const updated = { ...detail({ status: 'APPROVED' }).issue };
      issuesApi.approveIssue$.next(updated);
      expect(component.detail!.issue.status).toBe('APPROVED');
      expect(changeSpy).toHaveBeenCalledWith(updated);
      expect(component.approving).toBe(false);
    });

    it('approve() sets error on failure', () => {
      component.approve();
      issuesApi.approveIssue$.error(new Error('boom'));
      expect(component.error).toBe('Non riesco ad approvare la issue.');
      expect(component.approving).toBe(false);
    });

    it('archiveIssue() updates detail and emits issueChanged', () => {
      const changeSpy = jest.fn();
      component.issueChanged.subscribe(changeSpy);
      component.archiveIssue();
      const updated = { ...detail({ status: 'ARCHIVED' }).issue, archivedAt: '2026-09-19T08:00:00.000Z' };
      issuesApi.archiveIssue$.next(updated);
      expect(component.detail!.issue).toEqual(updated);
      expect(changeSpy).toHaveBeenCalledWith(updated);
    });

    it('archiveIssue() sets error on failure', () => {
      component.archiveIssue();
      issuesApi.archiveIssue$.error(new Error('boom'));
      expect(component.error).toBe('Non riesco ad archiviare la issue.');
    });

    it('deleteIssue() emits issueDeleted and closed on success', () => {
      const deleteSpy = jest.fn();
      const closeSpy = jest.fn();
      component.issueDeleted.subscribe(deleteSpy);
      component.closed.subscribe(closeSpy);
      component.deleteIssue();
      issuesApi.deleteIssue$.next();
      expect(deleteSpy).toHaveBeenCalledWith(1);
      expect(closeSpy).toHaveBeenCalled();
      expect(component.deleting).toBe(false);
    });

    it('deleteIssue() sets error on failure', () => {
      component.deleteIssue();
      issuesApi.deleteIssue$.error(new Error('boom'));
      expect(component.error).toBe('Non riesco a eliminare la issue.');
      expect(component.deleting).toBe(false);
    });
  });

  describe('comments', () => {
    beforeEach(() => {
      issuesApi.emitDetail(detail());
      issuesApi.completeDetail();
    });

    it('addComment() ignores empty draft', () => {
      component.commentDraft = '   ';
      component.addComment();
      expect(issuesApi.addComment).not.toHaveBeenCalled();
    });

    it('addComment() appends to detail comments on success', () => {
      component.commentDraft = '  Hello  ';
      component.addComment();
      expect(issuesApi.addComment).toHaveBeenCalledWith(1, 'Hello');
      issuesApi.addComment$.next({ id: 11, issueId: 1, projectId: 1, userId: 1, username: 'mario',
        date: '2026-09-19T08:00:00.000Z', comment: 'Hello', canDelete: false });
      expect(component.detail!.comments.length).toBe(1);
      expect(component.commentDraft).toBe('');
      expect(component.commentSaving).toBe(false);
    });

    it('addComment() sets error on failure', () => {
      component.commentDraft = 'Hello';
      component.addComment();
      issuesApi.addComment$.error(new Error('boom'));
      expect(component.error).toBe('Non riesco a salvare il commento.');
    });

    it('deleteComment() removes the matching comment', () => {
      component.detail = { ...component.detail!, comments: [
        { id: 11, issueId: 1, projectId: 1, userId: 1, username: 'mario',
          date: '2026-09-19T08:00:00.000Z', comment: 'A', canDelete: true } as IssueComment
      ]};
      component.deleteComment({ id: 11 } as IssueComment);
      issuesApi.deleteComment$.next();
      expect(component.detail!.comments.length).toBe(0);
    });

    it('deleteComment() sets error on failure', () => {
      component.detail = { ...component.detail!, comments: [
        { id: 11, issueId: 1, projectId: 1, userId: 1, username: 'mario',
          date: '2026-09-19T08:00:00.000Z', comment: 'A', canDelete: true } as IssueComment
      ]};
      component.deleteComment({ id: 11 } as IssueComment);
      issuesApi.deleteComment$.error(new Error('boom'));
      expect(component.error).toBe('Non riesco a eliminare il commento.');
    });
  });

  describe('attachment preview', () => {
    it('isImage() detects image content types', () => {
      expect(component.isImage({ contentType: 'image/png' } as IssueAttachment)).toBe(true);
      expect(component.isImage({ contentType: null } as IssueAttachment)).toBe(false);
      expect(component.isImage({ contentType: 'application/pdf' } as IssueAttachment)).toBe(false);
    });

    it('downloadAttachment() triggers blob download for non-image', () => {
      const saveSpy = jest.spyOn(component as any, 'saveBlob').mockImplementation(() => true);
      const att = { id: 5, contentType: 'application/pdf', originalName: 'doc.pdf' } as IssueAttachment;
      component.download(att);
      issuesApi.downloadAttachment$.next(new Blob(['x']));
      expect(saveSpy).toHaveBeenCalled();
    });
  });
});