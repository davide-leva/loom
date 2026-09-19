import type { IssueStatus, IssueSummary, IssueType } from './issues.service';

export interface IssueFilters {
  text?: string;
  status?: IssueStatus | 'ALL';
  type?: IssueType | 'ALL' | 'NONE' | null;
  issuerId?: number | 'ALL' | 'NONE';
  developerId?: number | 'ALL' | 'NONE';
  from?: Date | null;
  to?: Date | null;
}

export function filterIssues(issues: IssueSummary[], filters: IssueFilters): IssueSummary[] {
  const text = filters.text?.trim().toLowerCase() ?? '';
  const from = filters.from ? new Date(filters.from).setHours(0, 0, 0, 0) : null;
  const to = filters.to ? new Date(filters.to).setHours(23, 59, 59, 999) : null;
  return issues.filter(issue => {
    if (filters.status && filters.status !== 'ALL' && issue.status !== filters.status) return false;
    if (filters.type === 'NONE' && issue.issueType !== null) return false;
    if (filters.type && filters.type !== 'ALL' && filters.type !== 'NONE' && issue.issueType !== filters.type) return false;
    if (filters.issuerId === 'NONE' && issue.issuerUserId !== null) return false;
    if (typeof filters.issuerId === 'number' && issue.issuerUserId !== filters.issuerId) return false;
    if (filters.developerId === 'NONE' && issue.devUserId !== null) return false;
    if (typeof filters.developerId === 'number' && issue.devUserId !== filters.developerId) return false;
    const created = new Date(issue.createdAt).getTime();
    if (from !== null && created < from) return false;
    if (to !== null && created > to) return false;
    if (!text) return true;
    return searchableIssueText(issue).some(value => value.toLowerCase().includes(text));
  });
}

function searchableIssueText(issue: IssueSummary): string[] {
  return [
    issue.id.toString(),
    issue.title,
    issue.description,
    issue.issuerUsername ?? '',
    issue.devUsername ?? '',
    STATUS_LABELS[issue.status],
    issue.issueType === null ? 'Non categorizzata' : TYPE_LABELS[issue.issueType]
  ];
}

const STATUS_LABELS: Record<IssueStatus, string> = {
  REPORTED: 'Segnalato',
  IN_PROGRESS: 'In lavorazione',
  COMPLETED: 'Completato',
  RELEASED: 'Rilasciato',
  APPROVED: 'Approvato'
};

const TYPE_LABELS: Record<IssueType, string> = {
  ANOMALY: 'Anomalia',
  IMPROVEMENT: 'Miglioria',
  IMPLEMENTATION: 'Implementazione'
};
