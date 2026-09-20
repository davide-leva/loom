import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { AuthService } from './auth.service';
import { IssueNotificationsService } from './issue-notifications.service';

export type IssueStatus = 'REPORTED' | 'IN_PROGRESS' | 'COMPLETED' | 'RELEASED' | 'APPROVED';
export type IssueType = 'ANOMALY' | 'IMPROVEMENT' | 'IMPLEMENTATION';
export type UserRole = 'ADMIN' | 'TEAM' | 'SUPERUSER' | 'USER';

export type FieldType = 'TEXT' | 'TEXTAREA' | 'NUMBER' | 'SELECT' | 'ATTACHMENTS';
export type FieldScope = 'USER' | 'SUPERUSER' | 'TEAM';

export interface IssueField {
  id: number;
  projectId: number;
  code: string;
  label: string;
  description: string | null;
  mandatory: boolean;
  multiple: boolean;
  type: FieldType;
  scope: FieldScope;
}

export interface IssueFieldOption {
  id: number;
  definitionId: number;
  projectId: number;
  value: string;
  label: string;
  active: boolean;
}

export interface IssueFieldValueInput {
  definitionId: number;
  position: number;
  value: string;
}

export interface IssueValue {
  id: number;
  issueId: number;
  projectId: number;
  definitionId: number;
  label: string;
  position: number;
  value: string;
}

export interface IssueAttachment {
  id: number;
  issueId: number;
  projectId: number;
  definitionId: number | null;
  originalName: string;
  contentType: string | null;
  fileSize: number;
  uploadedAt: string;
  userId: number | null;
  username: string | null;
}

export interface IssueComment {
  id: number;
  issueId: number;
  projectId: number;
  userId: number | null;
  username: string | null;
  date: string;
  comment: string;
  canDelete: boolean;
}

export interface IssueDetail {
  issue: IssueSummary;
  values: IssueValue[];
  attachments: IssueAttachment[];
  comments: IssueComment[];
}

export interface IssueSummary {
  id: number;
  projectId: number;
  title: string;
  description: string;
  createdAt: string;
  status: IssueStatus;
  issueType: IssueType | null;
  releasedAt: string | null;
  approvedAt: string | null;
  issuerUserId: number | null;
  issuerUsername: string | null;
  devUserId: number | null;
  devUsername: string | null;
  approveUserId: number | null;
  approveUsername: string | null;
  internal: boolean;
  deletedAt: string | null;
  archivedAt: string | null;
  selectValues: Record<number, string[]>;
}

export interface CreateIssueInput {
  projectId: number;
  title: string;
  description: string;
  values: IssueFieldValueInput[];
  internal: boolean;
}

export interface ProjectUserSummary {
  id: number;
  username: string;
  firstName: string | null;
  lastName: string | null;
  role: UserRole;
}

export interface IssueReportFilters {
  search?: string;
  status?: IssueStatus;
  issueType?: IssueType;
  uncategorized?: boolean;
  issuerId?: number;
  issuerUnassigned?: boolean;
  developerId?: number;
  developerUnassigned?: boolean;
  internal?: boolean;
  from?: string;
  to?: string;
}

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

export const ISSUE_STATUSES: IssueStatus[] = ['REPORTED', 'IN_PROGRESS', 'COMPLETED', 'RELEASED', 'APPROVED'];

export const STATUS_LABELS: Record<IssueStatus, string> = {
  REPORTED: 'Segnalato',
  IN_PROGRESS: 'In lavorazione',
  COMPLETED: 'Completato',
  RELEASED: 'Rilasciato',
  APPROVED: 'Approvato'
};

export const TYPE_LABELS: Record<IssueType, string> = {
  ANOMALY: 'Anomalia',
  IMPROVEMENT: 'Miglioria',
  IMPLEMENTATION: 'Implementazione'
};
