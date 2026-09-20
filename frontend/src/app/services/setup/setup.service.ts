import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import type { SetupInput, SetupStatus } from '../../shared/models/setup.types';

export type { SetupInput, SetupStatus };

@Injectable({ providedIn: 'root' })
export class SetupService {
  private readonly http = inject(HttpClient);

  status(): Observable<SetupStatus> {
    return this.http.get<SetupStatus>('/api/setup/status');
  }

  setup(input: SetupInput, logo: File | null): Observable<void> {
    const form = new FormData();
    form.append('input', new Blob([JSON.stringify(input)], { type: 'application/json' }));
    if (logo) form.append('logo', logo);
    return this.http.post<void>('/api/setup', form);
  }
}