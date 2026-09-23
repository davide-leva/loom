import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { NotificheSegnalazioniService } from '../notifiche-segnalazioni/notifiche-segnalazioni.service';
import type {
  CreaSegnalazioneInput,
  SegnalazioneAllegato,
  SegnalazioneCommento,
  SegnalazioneDettaglio,
  SegnalazioneCampo,
  SegnalazioneCampoOpzione,
  SegnalazioneCampoValoreInput,
  FiltriReportSegnalazioni,
  StatusSegnalazione,
  SegnalazioneSummary,
  TipoSegnalazione,
  ProjectUserSummary
} from '../../shared/models/segnalazione.types';

export {
  SEGNALAZIONE_STATUS,
  STATUS_LABELS,
  TYPE_LABELS
} from '../../shared/models/segnalazione.types';
export type {
  CreaSegnalazioneInput,
  FieldScope,
  FieldType,
  SegnalazioneAllegato,
  SegnalazioneCommento,
  SegnalazioneDettaglio,
  SegnalazioneCampo,
  SegnalazioneCampoOpzione,
  SegnalazioneCampoValoreInput,
  FiltriReportSegnalazioni,
  StatusSegnalazione,
  SegnalazioneSummary,
  TipoSegnalazione,
  SegnalazioneValore,
  ProjectUserSummary,
  UserRole
} from '../../shared/models/segnalazione.types';

@Injectable({ providedIn: 'root' })
export class SegnalazioniService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly notifications = inject(NotificheSegnalazioniService);

  segnalazioneDettaglio(issueId: number): Observable<SegnalazioneDettaglio> {
    return this.http.get<SegnalazioneDettaglio>(`/api/work/issues/${issueId}`, {
      headers: this.auth.authHeaders()
    }).pipe(tap(() => this.notifications.markSeen(issueId)));
  }

  segnalazioni(projectId: number): Observable<SegnalazioneSummary[]> {
    return this.http.get<SegnalazioneSummary[]>(`/api/work/projects/${projectId}/issues`, {
      headers: this.auth.authHeaders()
    });
  }

  scaricaReportSegnalazioni(projectId: number, filters: FiltriReportSegnalazioni): Observable<Blob> {
    let params = new HttpParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') params = params.set(key, String(value));
    });
    return this.http.get(`/api/work/projects/${projectId}/issues/report`, {
      headers: this.auth.authHeaders(), params, responseType: 'blob'
    });
  }

  segnalazioneCampi(projectId: number): Observable<SegnalazioneCampo[]> {
    return this.http.get<SegnalazioneCampo[]>(`/api/work/projects/${projectId}/fields`, {
      headers: this.auth.authHeaders()
    });
  }

  segnalazioneCampoOpzioni(projectId: number): Observable<SegnalazioneCampoOpzione[]> {
    return this.http.get<SegnalazioneCampoOpzione[]>(`/api/work/projects/${projectId}/field-options`, {
      headers: this.auth.authHeaders()
    });
  }

  projectUsers(projectId: number): Observable<ProjectUserSummary[]> {
    return this.http.get<ProjectUserSummary[]>(`/api/work/projects/${projectId}/users`, {
      headers: this.auth.authHeaders()
    });
  }

  creaSegnalazione(input: CreaSegnalazioneInput): Observable<SegnalazioneSummary> {
    return this.http.post<SegnalazioneSummary>('/api/work/issues', input, {
      headers: this.auth.authHeaders()
    });
  }

  updateIssueValues(issueId: number, values: SegnalazioneCampoValoreInput[]): Observable<SegnalazioneDettaglio> {
    return this.http.patch<SegnalazioneDettaglio>(`/api/work/issues/${issueId}/values`, { values }, {
      headers: this.auth.authHeaders()
    });
  }

  uploadAttachment(issueId: number, definitionId: number, file: File): Observable<SegnalazioneAllegato> {
    const data = new FormData();
    data.append('definitionId', String(definitionId));
    data.append('file', file);
    return this.http.post<SegnalazioneAllegato>(`/api/work/issues/${issueId}/attachments`, data, {
      headers: this.auth.authHeaders()
    });
  }

  eliminaSegnalazione(issueId: number): Observable<void> {
    return this.http.delete<void>(`/api/work/issues/${issueId}`, { headers: this.auth.authHeaders() });
  }

  addComment(issueId: number, comment: string): Observable<SegnalazioneCommento> {
    return this.http.post<SegnalazioneCommento>(`/api/work/issues/${issueId}/comments`, { comment }, {
      headers: this.auth.authHeaders()
    });
  }

  deleteComment(commentId: number): Observable<void> {
    return this.http.delete<void>(`/api/work/comments/${commentId}`, { headers: this.auth.authHeaders() });
  }

  approvaSegnalazione(issueId: number): Observable<SegnalazioneSummary> {
    return this.http.patch<SegnalazioneSummary>(`/api/work/issues/${issueId}/approval`, {}, {
      headers: this.auth.authHeaders()
    });
  }

  archiviaSegnalazione(issueId: number): Observable<SegnalazioneSummary> {
    return this.http.post<SegnalazioneSummary>(`/api/work/issues/${issueId}/archive`, {}, {
      headers: this.auth.authHeaders()
    });
  }

  downloadAttachment(attachmentId: number): Observable<Blob> {
    return this.http.get(`/api/work/attachments/${attachmentId}/download`, {
      headers: this.auth.authHeaders(),
      responseType: 'blob'
    });
  }

  aggiornaPianificazione(issueId: number, issueType: TipoSegnalazione, devUserId: number | null): Observable<SegnalazioneSummary> {
    return this.http.patch<SegnalazioneSummary>(`/api/work/issues/${issueId}/planning`, { issueType, devUserId }, {
      headers: this.auth.authHeaders()
    });
  }

  updateStatus(issueId: number, status: StatusSegnalazione): Observable<SegnalazioneSummary> {
    return this.http.patch<SegnalazioneSummary>(`/api/work/issues/${issueId}/status`, { status }, {
      headers: this.auth.authHeaders()
    });
  }

  segnalazioniEliminate(projectId: number): Observable<SegnalazioneSummary[]> {
    return this.http.get<SegnalazioneSummary[]>(`/api/work/projects/${projectId}/issues/deleted`, {
      headers: this.auth.authHeaders()
    });
  }

  segnalazioniArchiviate(projectId: number): Observable<SegnalazioneSummary[]> {
    return this.http.get<SegnalazioneSummary[]>(`/api/work/projects/${projectId}/issues/archived`, {
      headers: this.auth.authHeaders()
    });
  }

  eliminaDefinitivamenteSegnalazioni(ids: number[]): Observable<void> {
    return this.http.post<void>('/api/work/issues/permanent-delete', { ids }, {
      headers: this.auth.authHeaders()
    });
  }
}