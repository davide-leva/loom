import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { AuthService } from './auth.service';

export interface ProjectEmailPreference {
  projectId: number;
  projectName: string;
  wantEmail: boolean | null;
}

export interface EmailPreferences {
  globalWantEmail: boolean | null;
  projects: ProjectEmailPreference[];
}

@Injectable({ providedIn: 'root' })
export class EmailPreferencesService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  get(): Observable<EmailPreferences> {
    return this.http.get<EmailPreferences>('/api/preferences/email', { headers: this.auth.authHeaders() });
  }

  update(input: EmailPreferences): Observable<EmailPreferences> {
    return this.http.put<EmailPreferences>('/api/preferences/email', input, { headers: this.auth.authHeaders() });
  }
}
