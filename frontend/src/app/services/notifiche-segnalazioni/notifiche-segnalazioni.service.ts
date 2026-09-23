import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import type {
  RiepilogoNotificheSegnalazioni,
  SezioneNotifica,
  SegnalazioneNonLetta
} from '../../shared/models/notification.types';

export type { RiepilogoNotificheSegnalazioni, SezioneNotifica, SegnalazioneNonLetta };

@Injectable({ providedIn: 'root' })
export class NotificheSegnalazioniService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly summary = signal<RiepilogoNotificheSegnalazioni | null>(null);
  private requestSequence = 0;

  refresh(projectId: number): void {
    const sequence = ++this.requestSequence;
    this.http.get<RiepilogoNotificheSegnalazioni>(`/api/work/projects/${projectId}/notifications`, {
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

  count(section: SezioneNotifica): number {
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

  private withCounts(current: RiepilogoNotificheSegnalazioni,
                     segnalazioni: SegnalazioneNonLetta[]): RiepilogoNotificheSegnalazioni {
    return {
      ...current,
      total: segnalazioni.length,
      planning: segnalazioni.filter(segnalazione => segnalazione.issueType === null).length,
      anomalies: segnalazioni.filter(segnalazione => segnalazione.issueType === 'ANOMALY').length,
      improvements: segnalazioni.filter(segnalazione => segnalazione.issueType === 'IMPROVEMENT').length,
      implementations: segnalazioni.filter(segnalazione => segnalazione.issueType === 'IMPLEMENTATION').length,
      issues: segnalazioni
    };
  }
}