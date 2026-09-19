import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { AuthService } from '../auth.service';

export interface ExternalSubjectMapping {
  id: number;
  subject: string;
  userId: number;
  username: string;
}

export interface ExternalJwtSecret {
  id: number;
  name: string;
  algorithm: 'HS256' | 'HS384' | 'HS512';
  secretBase64: boolean;
  userCount: number;
  mappings: ExternalSubjectMapping[];
}

export interface ExternalApplicationInput {
  name: string;
  secret: string;
  algorithm: ExternalJwtSecret['algorithm'];
  secretBase64: boolean;
}

export interface ExternalAuthConfig {
  projectId: number;
  enabled: boolean;
  secrets: ExternalJwtSecret[];
}

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
