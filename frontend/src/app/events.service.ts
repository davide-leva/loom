import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { AuthService } from './auth.service';

export type EventType = 'ISSUE_CREATED' | 'ISSUE_PLANNED' | 'ISSUE_STATUS_CHANGED' | 'ISSUE_APPROVED'
  | 'ISSUE_COMMENT_ADDED' | 'ISSUE_COMMENT_DELETED' | 'ISSUE_ATTACHMENT_UPLOADED'
  | 'ISSUE_VALUES_CHANGED' | 'ISSUE_DELETED';

export interface WorkspaceEvent {
  id: number;
  eventDate: string;
  type: EventType;
  data: string;
  issueId: number | null;
  issueTitle: string | null;
  internal: boolean;
  actorId: number | null;
  actorUsername: string | null;
}

export interface EventPage { items: WorkspaceEvent[]; total: number; }
export interface EventActor { id: number; username: string; }
export interface EventFilters {
  page: number;
  size: number;
  type?: EventType;
  actorId?: number;
  from?: string;
  to?: string;
}

@Injectable({ providedIn: 'root' })
export class EventsService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  list(projectId: number, filters: EventFilters): Observable<EventPage> {
    let params = new HttpParams().set('page', filters.page).set('size', filters.size);
    if (filters.type) params = params.set('type', filters.type);
    if (filters.actorId) params = params.set('actorId', filters.actorId);
    if (filters.from) params = params.set('from', filters.from);
    if (filters.to) params = params.set('to', filters.to);
    return this.http.get<EventPage>(`/api/work/projects/${projectId}/events`, {
      headers: this.auth.authHeaders(), params
    });
  }

  actors(projectId: number): Observable<EventActor[]> {
    return this.http.get<EventActor[]>(`/api/work/projects/${projectId}/events/actors`, {
      headers: this.auth.authHeaders()
    });
  }

}
