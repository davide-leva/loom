import { Component, OnInit, computed, effect, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MenuItem } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { MenuModule } from 'primeng/menu';
import { SelectModule } from 'primeng/select';
import { AuthService } from './auth.service';
import { ProjectContextService } from './project-context.service';
import { LiveSyncService } from './live-sync.service';
import { IssueNotificationsService } from './issue-notifications.service';

@Component({
  selector: 'app-main-layout',
  imports: [FormsModule, RouterLink, RouterLinkActive, RouterOutlet, ButtonModule, MenuModule, SelectModule],
  templateUrl: './main-layout.component.html',
  styleUrl: './main-layout.component.css'
})
export class MainLayoutComponent implements OnInit {
  readonly auth = inject(AuthService);
  readonly projectContext = inject(ProjectContextService);
  readonly liveSync = inject(LiveSyncService);
  readonly notifications = inject(IssueNotificationsService);
  private readonly router = inject(Router);

  readonly userMenuItems = computed<MenuItem[]>(() => [
    { label: `Compagnia: ${this.auth.user()?.companyName ?? this.auth.user()?.internalCompanyName ?? 'Interna'}`,
      icon: 'pi pi-building', disabled: true },
    { separator: true },
    { label: 'Notifiche email', icon: 'pi pi-envelope', command: () => void this.router.navigateByUrl('/preferenze-email') },
    { label: 'Logout', icon: 'pi pi-sign-out', command: () => this.logout() }
  ]);

  constructor() {
    effect(onCleanup => {
      const projectId = this.projectContext.currentProjectId();
      if (!projectId) return;
      const subscription = this.liveSync.watch(projectId);
      onCleanup(() => subscription.unsubscribe());
    });
    effect(() => {
      const projectId = this.projectContext.currentProjectId();
      this.liveSync.revision();
      if (projectId) this.notifications.refresh(projectId);
      else this.notifications.clear();
    });
  }

  ngOnInit(): void {
    this.projectContext.load();
  }

  logout(): void {
    this.notifications.clear();
    this.projectContext.clear();
    this.auth.logout();
    void this.router.navigateByUrl('/login');
  }
}
