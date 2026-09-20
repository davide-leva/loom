import { HttpHeaders, HttpParams } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { IssuesService } from './issues.service';
import { IssueNotificationsService } from '../issue-notifications/issue-notifications.service';
import { AuthService } from '../auth/auth.service';
import type {
  CreateIssueInput,
  IssueAttachment,
  IssueComment,
  IssueDetail,
  IssueField,
  IssueFieldOption,
  IssueReportFilters,
  IssueSummary,
  IssueValue,
  ProjectUserSummary
} from '../../shared/models/issue.types';

describe('IssuesService', () => {
  let service: IssuesService;
  let http: HttpTestingController;
  let auth: { authHeaders: jest.Mock };
  let notifications: { markSeen: jest.Mock };

  const summary: IssueSummary = {
    id: 7,
    projectId: 1,
    title: 'Sample',
    description: '',
    createdAt: '2026-09-19T08:00:00.000Z',
    status: 'REPORTED',
    issueType: null,
    releasedAt: null,
    approvedAt: null,
    issuerUserId: null,
    issuerUsername: null,
    devUserId: null,
    devUsername: null,
    approveUserId: null,
    approveUsername: null,
    internal: false,
    deletedAt: null,
    archivedAt: null,
    selectValues: {}
  };

  const detail: IssueDetail = {
    issue: summary,
    values: [] as IssueValue[],
    attachments: [] as IssueAttachment[],
    comments: [] as IssueComment[]
  };

  beforeEach(() => {
    sessionStorage.clear();
    auth = { authHeaders: jest.fn(() => new HttpHeaders({ Authorization: 'Bearer test' })) };
    notifications = { markSeen: jest.fn() };
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: auth },
        { provide: IssueNotificationsService, useValue: notifications }
      ]
    });
    service = TestBed.inject(IssuesService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    sessionStorage.clear();
  });

  it('issues() fetches the project issue list with auth headers', () => {
    let resolved: IssueSummary[] | undefined;
    service.issues(1).subscribe(value => { resolved = value; });
    const req = http.expectOne('/api/work/projects/1/issues');
    expect(req.request.method).toBe('GET');
    expect(req.request.headers.get('Authorization')).toBe('Bearer test');
    req.flush([summary]);
    expect(resolved).toEqual([summary]);
  });

  it('issueDetail() fetches the detail and marks it seen on notifications', () => {
    let resolved: IssueDetail | undefined;
    service.issueDetail(7).subscribe(value => { resolved = value; });
    const req = http.expectOne('/api/work/issues/7');
    expect(req.request.method).toBe('GET');
    expect(req.request.headers.get('Authorization')).toBe('Bearer test');
    req.flush(detail);
    expect(resolved).toEqual(detail);
    expect(notifications.markSeen).toHaveBeenCalledWith(7);
  });

  it('createIssue() POSTs the input payload', () => {
    const input: CreateIssueInput = {
      projectId: 1,
      title: 'New',
      description: 'Body',
      values: [{ definitionId: 2, position: 0, value: 'x' }],
      internal: false
    };
    let resolved: IssueSummary | undefined;
    service.createIssue(input).subscribe(value => { resolved = value; });
    const req = http.expectOne('/api/work/issues');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(input);
    expect(req.request.headers.get('Authorization')).toBe('Bearer test');
    req.flush(summary);
    expect(resolved).toEqual(summary);
  });

  it('updateStatus() PATCHes the status payload', () => {
    let resolved: IssueSummary | undefined;
    service.updateStatus(7, 'IN_PROGRESS').subscribe(value => { resolved = value; });
    const req = http.expectOne('/api/work/issues/7/status');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ status: 'IN_PROGRESS' });
    expect(req.request.headers.get('Authorization')).toBe('Bearer test');
    req.flush(summary);
    expect(resolved).toEqual(summary);
  });

  it('updatePlanning() PATCHes the planning payload with developer', () => {
    let resolved: IssueSummary | undefined;
    service.updatePlanning(7, 'ANOMALY', 99).subscribe(value => { resolved = value; });
    const req = http.expectOne('/api/work/issues/7/planning');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ issueType: 'ANOMALY', devUserId: 99 });
    expect(req.request.headers.get('Authorization')).toBe('Bearer test');
    req.flush(summary);
    expect(resolved).toEqual(summary);
  });

  it('updatePlanning() PATCHes the planning payload with null developer', () => {
    service.updatePlanning(7, null, null).subscribe();
    const req = http.expectOne('/api/work/issues/7/planning');
    expect(req.request.body).toEqual({ issueType: null, devUserId: null });
    req.flush(summary);
  });

  it('updateIssueValues() PATCHes the field values payload', () => {
    let resolved: IssueDetail | undefined;
    service.updateIssueValues(7, [{ definitionId: 3, position: 0, value: 'A' }]).subscribe(value => {
      resolved = value;
    });
    const req = http.expectOne('/api/work/issues/7/values');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ values: [{ definitionId: 3, position: 0, value: 'A' }] });
    expect(req.request.headers.get('Authorization')).toBe('Bearer test');
    req.flush(detail);
    expect(resolved).toEqual(detail);
  });

  it('uploadAttachment() POSTs the multipart form data', () => {
    const attachment: IssueAttachment = {
      id: 1,
      issueId: 7,
      projectId: 1,
      definitionId: 4,
      originalName: 'a.txt',
      contentType: 'text/plain',
      fileSize: 4,
      uploadedAt: '2026-09-19T08:00:00.000Z',
      userId: 1,
      username: 'mario'
    };
    const file = new File(['hello'], 'a.txt', { type: 'text/plain' });
    let resolved: IssueAttachment | undefined;
    service.uploadAttachment(7, 4, file).subscribe(value => { resolved = value; });
    const req = http.expectOne('/api/work/issues/7/attachments');
    expect(req.request.method).toBe('POST');
    expect(req.request.body instanceof FormData).toBe(true);
    const form = req.request.body as FormData;
    expect(form.get('definitionId')).toBe('4');
    expect((form.get('file') as File).name).toBe('a.txt');
    expect(req.request.headers.get('Authorization')).toBe('Bearer test');
    req.flush(attachment);
    expect(resolved).toEqual(attachment);
  });

  it('deleteIssue() DELETEs the issue by id', () => {
    let resolved: void | undefined;
    service.deleteIssue(7).subscribe(value => { resolved = value; });
    const req = http.expectOne('/api/work/issues/7');
    expect(req.request.method).toBe('DELETE');
    expect(req.request.headers.get('Authorization')).toBe('Bearer test');
    req.flush(null);
    expect(resolved).toBeNull();
  });

  it('deletedIssues() fetches the soft-deleted list for the project', () => {
    let resolved: IssueSummary[] | undefined;
    service.deletedIssues(1).subscribe(value => { resolved = value; });
    const req = http.expectOne('/api/work/projects/1/issues/deleted');
    expect(req.request.method).toBe('GET');
    expect(req.request.headers.get('Authorization')).toBe('Bearer test');
    req.flush([summary]);
    expect(resolved).toEqual([summary]);
  });

  it('archivedIssues() fetches the archived list for the project', () => {
    let resolved: IssueSummary[] | undefined;
    service.archivedIssues(1).subscribe(value => { resolved = value; });
    const req = http.expectOne('/api/work/projects/1/issues/archived');
    expect(req.request.method).toBe('GET');
    expect(req.request.headers.get('Authorization')).toBe('Bearer test');
    req.flush([summary]);
    expect(resolved).toEqual([summary]);
  });

  it('permanentlyDeleteIssues() POSTs the ids payload', () => {
    let resolved: void | undefined;
    service.permanentlyDeleteIssues([1, 2, 3]).subscribe(value => { resolved = value; });
    const req = http.expectOne('/api/work/issues/permanent-delete');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ ids: [1, 2, 3] });
    expect(req.request.headers.get('Authorization')).toBe('Bearer test');
    req.flush(null);
    expect(resolved).toBeNull();
  });

  it('archiveIssue() POSTs to the archive endpoint', () => {
    let resolved: IssueSummary | undefined;
    service.archiveIssue(7).subscribe(value => { resolved = value; });
    const req = http.expectOne('/api/work/issues/7/archive');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({});
    expect(req.request.headers.get('Authorization')).toBe('Bearer test');
    req.flush(summary);
    expect(resolved).toEqual(summary);
  });

  it('approveIssue() PATCHes the approval endpoint', () => {
    let resolved: IssueSummary | undefined;
    service.approveIssue(7).subscribe(value => { resolved = value; });
    const req = http.expectOne('/api/work/issues/7/approval');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({});
    expect(req.request.headers.get('Authorization')).toBe('Bearer test');
    req.flush(summary);
    expect(resolved).toEqual(summary);
  });

  it('addComment() POSTs the comment body', () => {
    const comment: IssueComment = {
      id: 1,
      issueId: 7,
      projectId: 1,
      userId: 1,
      username: 'mario',
      date: '2026-09-19T08:00:00.000Z',
      comment: 'hi',
      canDelete: true
    };
    let resolved: IssueComment | undefined;
    service.addComment(7, 'hi').subscribe(value => { resolved = value; });
    const req = http.expectOne('/api/work/issues/7/comments');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ comment: 'hi' });
    expect(req.request.headers.get('Authorization')).toBe('Bearer test');
    req.flush(comment);
    expect(resolved).toEqual(comment);
  });

  it('deleteComment() DELETEs the comment by id', () => {
    let resolved: void | undefined;
    service.deleteComment(11).subscribe(value => { resolved = value; });
    const req = http.expectOne('/api/work/comments/11');
    expect(req.request.method).toBe('DELETE');
    expect(req.request.headers.get('Authorization')).toBe('Bearer test');
    req.flush(null);
    expect(resolved).toBeNull();
  });

  it('downloadAttachment() GETs the blob with auth headers', () => {
    const blob = new Blob(['x'], { type: 'text/plain' });
    let resolved: Blob | undefined;
    service.downloadAttachment(12).subscribe(value => { resolved = value; });
    const req = http.expectOne('/api/work/attachments/12/download');
    expect(req.request.method).toBe('GET');
    expect(req.request.headers.get('Authorization')).toBe('Bearer test');
    expect(req.request.responseType).toBe('blob');
    req.flush(blob);
    expect(resolved).toBe(blob);
  });

  it('downloadIssueReport() builds HttpParams from filters and returns a blob', () => {
    const filters: IssueReportFilters = {
      search: 'bug',
      status: 'IN_PROGRESS',
      issueType: 'ANOMALY',
      uncategorized: false,
      issuerId: 5,
      issuerUnassigned: undefined,
      developerId: 0,
      internal: true,
      from: '2026-09-01',
      to: '2026-09-30'
    };
    const blob = new Blob(['report']);
    let resolved: Blob | undefined;
    service.downloadIssueReport(1, filters).subscribe(value => { resolved = value; });
    const req = http.expectOne(r => r.url === '/api/work/projects/1/issues/report');
    expect(req.request.method).toBe('GET');
    expect(req.request.responseType).toBe('blob');
    expect(req.request.headers.get('Authorization')).toBe('Bearer test');
    expect(req.request.params.get('search')).toBe('bug');
    expect(req.request.params.get('status')).toBe('IN_PROGRESS');
    expect(req.request.params.get('issueType')).toBe('ANOMALY');
    expect(req.request.params.get('uncategorized')).toBe('false');
    expect(req.request.params.get('issuerId')).toBe('5');
    expect(req.request.params.has('issuerUnassigned')).toBe(false);
    expect(req.request.params.get('developerId')).toBe('0');
    expect(req.request.params.get('internal')).toBe('true');
    expect(req.request.params.get('from')).toBe('2026-09-01');
    expect(req.request.params.get('to')).toBe('2026-09-30');
    req.flush(blob);
    expect(resolved).toBe(blob);
  });

  it('issueFields() fetches the field definitions for the project', () => {
    const fields: IssueField[] = [];
    let resolved: IssueField[] | undefined;
    service.issueFields(1).subscribe(value => { resolved = value; });
    const req = http.expectOne('/api/work/projects/1/fields');
    expect(req.request.method).toBe('GET');
    expect(req.request.headers.get('Authorization')).toBe('Bearer test');
    req.flush(fields);
    expect(resolved).toEqual(fields);
  });

  it('issueFieldOptions() fetches the field options for the project', () => {
    const options: IssueFieldOption[] = [];
    let resolved: IssueFieldOption[] | undefined;
    service.issueFieldOptions(1).subscribe(value => { resolved = value; });
    const req = http.expectOne('/api/work/projects/1/field-options');
    expect(req.request.method).toBe('GET');
    expect(req.request.headers.get('Authorization')).toBe('Bearer test');
    req.flush(options);
    expect(resolved).toEqual(options);
  });

  it('projectUsers() fetches the project user summaries', () => {
    const users: ProjectUserSummary[] = [];
    let resolved: ProjectUserSummary[] | undefined;
    service.projectUsers(1).subscribe(value => { resolved = value; });
    const req = http.expectOne('/api/work/projects/1/users');
    expect(req.request.method).toBe('GET');
    expect(req.request.headers.get('Authorization')).toBe('Bearer test');
    req.flush(users);
    expect(resolved).toEqual(users);
  });
});
