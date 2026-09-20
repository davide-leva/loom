// Issue domain types extracted from issues.service.ts.

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