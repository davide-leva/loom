import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { AuthService } from './auth.service';
import type { IssueType } from './issues.service';

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

@Injectable({ providedIn: 'root' })
export class IssueNotificationsService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly summary = signal<IssueNotificationSummary | null>(null);
  private requestSequence = 0;

  refresh(projectId: number): void {
    const sequence = ++this.requestSequence;
    this.http.get<IssueNotificationSummary>(`/api/work/projects/${projectId}/notifications`, {
      headers: this.auth.authHeaders()
    }).subscribe({
      next: summary => {
        if (sequence === this.requestSequence) this.summary.set(summary);
      },
      error: () => {
        if (sequence === this.requestSequence && this.summary()?.projectId !== projectId) this.summary.set(null);
      }
    });
  }

  clear(): void {
    this.requestSequence++;
    this.summary.set(null);
  }

  count(section: NotificationSection): number {
    const value = this.summary();
    if (!value) return 0;
    if (section === 'PLANNING') return value.planning;
    if (section === 'ANOMALY') return value.anomalies;
    if (section === 'IMPROVEMENT') return value.improvements;
    return value.implementations;
  }

  isUnread(issueId: number): boolean {
    return this.summary()?.issues.some(issue => issue.issueId === issueId) ?? false;
  }

  markSeen(issueId: number): void {
    const current = this.summary();
    this.requestSequence++;
    if (!current) return;
    if (current.issues.some(issue => issue.issueId === issueId)) {
      this.summary.set(this.withCounts(current, current.issues.filter(issue => issue.issueId !== issueId)));
    }
    // The detail response is committed at this point; reload to discard any older in-flight summary.
    this.refresh(current.projectId);
  }

  private withCounts(current: IssueNotificationSummary,
                     issues: UnreadIssueNotification[]): IssueNotificationSummary {
    return {
      ...current,
      total: issues.length,
      planning: issues.filter(issue => issue.issueType === null).length,
      anomalies: issues.filter(issue => issue.issueType === 'ANOMALY').length,
      improvements: issues.filter(issue => issue.issueType === 'IMPROVEMENT').length,
      implementations: issues.filter(issue => issue.issueType === 'IMPLEMENTATION').length,
      issues
    };
  }
}
