// Notification domain types extracted from issue-notifications.service.ts.

import type { IssueType } from './issue.types';

export interface UnreadIssueNotification {
  issueId: number;
  issueType: IssueType | null;
}

export interface IssueNotificationSummary {
  projectId: number;
  total: number;
  planning: number;
  anomalies: number;
  improvements: number;
  implementations: number;
  issues: UnreadIssueNotification[];
}

export type NotificationSection = 'PLANNING' | IssueType;