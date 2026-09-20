import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { AuthService } from '../../auth/auth.service';
import type {
  ExternalApplicationInput,
  ExternalAuthConfig,
  ExternalJwtSecret,
  ExternalSubjectMapping
} from '../../../shared/models/external-auth.types';

export type {
  ExternalApplicationInput,
  ExternalAuthConfig,
  ExternalJwtSecret,
  ExternalSubjectMapping
};

@Injectable({ providedIn: 'root' })
export class ExternalAuthConfigService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  private url(projectId: number): string {
    return `/api/external-auth/projects/${projectId}`;
  }

  get(projectId: number): Observable<ExternalAuthConfig> {
    return this.http.get<ExternalAuthConfig>(this.url(projectId), { headers: this.auth.authHeaders() });
  }

  setEnabled(projectId: number, enabled: boolean): Observable<ExternalAuthConfig> {
    return this.http.put<ExternalAuthConfig>(this.url(projectId), { enabled }, { headers: this.auth.authHeaders() });
  }

  addSecret(projectId: number, input: ExternalApplicationInput): Observable<ExternalAuthConfig> {
    return this.http.post<ExternalAuthConfig>(`${this.url(projectId)}/secrets`, input,
      { headers: this.auth.authHeaders() });
  }

  updateSecret(projectId: number, secretId: number, input: ExternalApplicationInput): Observable<ExternalAuthConfig> {
    return this.http.put<ExternalAuthConfig>(`${this.url(projectId)}/secrets/${secretId}`, input,
      { headers: this.auth.authHeaders() });
  }

  deleteSecret(projectId: number, secretId: number): Observable<void> {
    return this.http.delete<void>(`${this.url(projectId)}/secrets/${secretId}`,
      { headers: this.auth.authHeaders() });
  }

  addMapping(projectId: number, secretId: number, subject: string, userId: number): Observable<ExternalAuthConfig> {
    return this.http.post<ExternalAuthConfig>(`${this.url(projectId)}/secrets/${secretId}/mappings`,
      { subject, userId }, { headers: this.auth.authHeaders() });
  }

  deleteMapping(projectId: number, secretId: number, mappingId: number): Observable<void> {
    return this.http.delete<void>(`${this.url(projectId)}/secrets/${secretId}/mappings/${mappingId}`,
      { headers: this.auth.authHeaders() });
  }
}
