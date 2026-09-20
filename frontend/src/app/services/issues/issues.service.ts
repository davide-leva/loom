import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { IssueNotificationsService } from '../issue-notifications/issue-notifications.service';
import type {
  CreateIssueInput,
  IssueAttachment,
  IssueComment,
  IssueDetail,
  IssueField,
  IssueFieldOption,
  IssueFieldValueInput,
  IssueReportFilters,
  IssueStatus,
  IssueSummary,
  IssueType,
  ProjectUserSummary
} from '../../shared/models/issue.types';

export {
  ISSUE_STATUSES,
  STATUS_LABELS,
  TYPE_LABELS
} from '../../shared/models/issue.types';
export type {
  CreateIssueInput,
  FieldScope,
  FieldType,
  IssueAttachment,
  IssueComment,
  IssueDetail,
  IssueField,
  IssueFieldOption,
  IssueFieldValueInput,
  IssueReportFilters,
  IssueStatus,
  IssueSummary,
  IssueType,
  IssueValue,
  ProjectUserSummary,
  UserRole
} from '../../shared/models/issue.types';

@Injectable({ providedIn: 'root' })
export class IssuesService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly notifications = inject(IssueNotificationsService);

  issueDetail(issueId: number): Observable<IssueDetail> {
    return this.http.get<IssueDetail>(`/api/work/issues/${issueId}`, {
      headers: this.auth.authHeaders()
    }).pipe(tap(() => this.notifications.markSeen(issueId)));
  }

  issues(projectId: number): Observable<IssueSummary[]> {
    return this.http.get<IssueSummary[]>(`/api/work/projects/${projectId}/issues`, {
      headers: this.auth.authHeaders()
    });
  }

  downloadIssueReport(projectId: number, filters: IssueReportFilters): Observable<Blob> {
    let params = new HttpParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') params = params.set(key, String(value));
    });
    return this.http.get(`/api/work/projects/${projectId}/issues/report`, {
      headers: this.auth.authHeaders(), params, responseType: 'blob'
    });
  }

  issueFields(projectId: number): Observable<IssueField[]> {
    return this.http.get<IssueField[]>(`/api/work/projects/${projectId}/fields`, {
      headers: this.auth.authHeaders()
    });
  }

  issueFieldOptions(projectId: number): Observable<IssueFieldOption[]> {
    return this.http.get<IssueFieldOption[]>(`/api/work/projects/${projectId}/field-options`, {
      headers: this.auth.authHeaders()
    });
  }

  projectUsers(projectId: number): Observable<ProjectUserSummary[]> {
    return this.http.get<ProjectUserSummary[]>(`/api/work/projects/${projectId}/users`, {
      headers: this.auth.authHeaders()
    });
  }

  createIssue(input: CreateIssueInput): Observable<IssueSummary> {
    return this.http.post<IssueSummary>('/api/work/issues', input, {
      headers: this.auth.authHeaders()
    });
  }

  updateIssueValues(issueId: number, values: IssueFieldValueInput[]): Observable<IssueDetail> {
    return this.http.patch<IssueDetail>(`/api/work/issues/${issueId}/values`, { values }, {
      headers: this.auth.authHeaders()
    });
  }

  uploadAttachment(issueId: number, definitionId: number, file: File): Observable<IssueAttachment> {
    const data = new FormData();
    data.append('definitionId', String(definitionId));
    data.append('file', file);
    return this.http.post<IssueAttachment>(`/api/work/issues/${issueId}/attachments`, data, {
      headers: this.auth.authHeaders()
    });
  }

  deleteIssue(issueId: number): Observable<void> {
    return this.http.delete<void>(`/api/work/issues/${issueId}`, { headers: this.auth.authHeaders() });
  }

  addComment(issueId: number, comment: string): Observable<IssueComment> {
    return this.http.post<IssueComment>(`/api/work/issues/${issueId}/comments`, { comment }, {
      headers: this.auth.authHeaders()
    });
  }

  deleteComment(commentId: number): Observable<void> {
    return this.http.delete<void>(`/api/work/comments/${commentId}`, { headers: this.auth.authHeaders() });
  }

  approveIssue(issueId: number): Observable<IssueSummary> {
    return this.http.patch<IssueSummary>(`/api/work/issues/${issueId}/approval`, {}, {
      headers: this.auth.authHeaders()
    });
  }

  archiveIssue(issueId: number): Observable<IssueSummary> {
    return this.http.post<IssueSummary>(`/api/work/issues/${issueId}/archive`, {}, {
      headers: this.auth.authHeaders()
    });
  }

  downloadAttachment(attachmentId: number): Observable<Blob> {
    return this.http.get(`/api/work/attachments/${attachmentId}/download`, {
      headers: this.auth.authHeaders(),
      responseType: 'blob'
    });
  }

  updatePlanning(issueId: number, issueType: IssueType, devUserId: number | null): Observable<IssueSummary> {
    return this.http.patch<IssueSummary>(`/api/work/issues/${issueId}/planning`, { issueType, devUserId }, {
      headers: this.auth.authHeaders()
    });
  }

  updateStatus(issueId: number, status: IssueStatus): Observable<IssueSummary> {
    return this.http.patch<IssueSummary>(`/api/work/issues/${issueId}/status`, { status }, {
      headers: this.auth.authHeaders()
    });
  }

  deletedIssues(projectId: number): Observable<IssueSummary[]> {
    return this.http.get<IssueSummary[]>(`/api/work/projects/${projectId}/issues/deleted`, {
      headers: this.auth.authHeaders()
    });
  }

  archivedIssues(projectId: number): Observable<IssueSummary[]> {
    return this.http.get<IssueSummary[]>(`/api/work/projects/${projectId}/issues/archived`, {
      headers: this.auth.authHeaders()
    });
  }

  permanentlyDeleteIssues(ids: number[]): Observable<void> {
    return this.http.post<void>('/api/work/issues/permanent-delete', { ids }, {
      headers: this.auth.authHeaders()
    });
  }
}