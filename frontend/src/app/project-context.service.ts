import { DOCUMENT } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService, ProjectSummary } from './auth.service';

@Injectable({ providedIn: 'root' })
export class ProjectContextService {
  private readonly document = inject(DOCUMENT);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly projects = signal<ProjectSummary[]>([]);
  readonly currentProjectId = signal<number | null>(null);
  readonly loadError = signal(false);

  load(): void {
    this.projects.set([]);
    this.currentProjectId.set(null);
    this.loadError.set(false);
    const userId = this.auth.user()?.id;
    this.auth.projects().subscribe({
      next: available => {
        if (this.auth.user()?.id !== userId) return;
        this.projects.set(available);
        const cookieValue = this.readCookie();
        const savedId = cookieValue === null ? null : Number(cookieValue);
        const selected = available.find(project => project.id === savedId) ?? available[0];
        this.currentProjectId.set(selected?.id ?? null);
        if (selected) this.writeCookie(selected.id);
      },
      error: (error: unknown) => {
        if (this.auth.user()?.id !== userId) return;
        if (error instanceof HttpErrorResponse && (error.status === 401 || error.status === 403)) {
          this.clear();
          this.auth.logout();
          void this.router.navigateByUrl('/login');
          return;
        }
        this.projects.set([]);
        this.currentProjectId.set(null);
        this.loadError.set(true);
      }
    });
  }

  select(id: number | null): void {
    if (id === null || !this.projects().some(project => project.id === id)) return;
    this.currentProjectId.set(id);
    this.writeCookie(id);
  }

  currentProject(): ProjectSummary | null {
    return this.projects().find(project => project.id === this.currentProjectId()) ?? null;
  }

  clear(): void {
    this.projects.set([]);
    this.currentProjectId.set(null);
    this.loadError.set(false);
  }

  private cookieName(): string {
    return `sf2-current-project-${this.auth.user()?.id ?? 'anonymous'}`;
  }

  private readCookie(): string | null {
    const entry = this.document.cookie.split('; ').find(item => item.startsWith(`${this.cookieName()}=`));
    return entry?.slice(this.cookieName().length + 1) ?? null;
  }

  private writeCookie(id: number): void {
    this.document.cookie = `${this.cookieName()}=${id}; Path=/; Max-Age=31536000; SameSite=Lax`;
  }
}
