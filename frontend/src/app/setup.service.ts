import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

export interface SetupStatus { required: boolean; }
export interface SetupInput {
  teamCompanyName: string;
  username: string;
  email: string;
  password: string;
  firstName: string | null;
  lastName: string | null;
}

@Injectable({ providedIn: 'root' })
export class SetupService {
  private readonly http = inject(HttpClient);
  status(): Observable<SetupStatus> { return this.http.get<SetupStatus>('/api/setup/status'); }
  setup(input: SetupInput): Observable<void> { return this.http.post<void>('/api/setup', input); }
}
