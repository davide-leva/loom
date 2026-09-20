import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import type {
  EventActor,
  EventFilters,
  EventPage,
  EventType,
  WorkspaceEvent
} from '../../shared/models/event.types';

export type { EventActor, EventFilters, EventPage, EventType, WorkspaceEvent };

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