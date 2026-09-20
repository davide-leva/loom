import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import type { EmailPreferences } from '../../shared/models/email-preferences.types';

export type { EmailPreferences, ProjectEmailPreference } from '../../shared/models/email-preferences.types';

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