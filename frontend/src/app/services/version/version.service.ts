import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { catchError, of } from 'rxjs';
import type { VersionInfo } from './version.types';

@Injectable({ providedIn: 'root' })
export class VersionService {
  private readonly http = inject(HttpClient);
  private readonly _info = signal<VersionInfo | null>(null);
  readonly info = this._info.asReadonly();
  private loaded = false;

  load(): void {
    if (this.loaded) return;
    this.loaded = true;
    this.http.get<VersionInfo>('/api/version').pipe(
      catchError(() => of<VersionInfo | null>(null))
    ).subscribe(info => {
      if (info) this._info.set(info);
    });
  }
}
