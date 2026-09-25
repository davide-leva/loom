import { Component, computed, effect, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MenuItem } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { MenuModule } from 'primeng/menu';
import { SelectModule } from 'primeng/select';
import { AuthService } from '../../services/auth/auth.service';
import { ProjectContextService } from '../../services/project-context/project-context.service';
import { LiveSyncService } from '../../services/live-sync/live-sync.service';
import { NotificheSegnalazioniService } from '../../services/notifiche-segnalazioni/notifiche-segnalazioni.service';
import { TourService } from '../../services/tour/tour.service';
import { VersionService } from '../../services/version/version.service';
import { LOOM_LOGOTYPE_URL } from '../../shared/brand-assets';
import { VersionBadgeComponent } from '../version-badge/version-badge.component';
import { TourOverlayComponent } from '../tour-overlay/tour-overlay.component';

@Component({
  selector: 'app-main-layout',
  imports: [FormsModule, RouterLink, RouterLinkActive, RouterOutlet, ButtonModule, MenuModule, SelectModule,
            TourOverlayComponent, VersionBadgeComponent],
  templateUrl: './main-layout.component.html',
  styleUrl: './main-layout.component.css'
})
export class MainLayoutComponent {
  readonly auth = inject(AuthService);
  readonly projectContext = inject(ProjectContextService);
  readonly liveSync = inject(LiveSyncService);
  readonly notifications = inject(NotificheSegnalazioniService);
  readonly tour = inject(TourService);
  private readonly version = inject(VersionService);
  private readonly router = inject(Router);

  readonly loomLogoUrl = LOOM_LOGOTYPE_URL;

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
    effect(() => {
      const user = this.auth.user();
      const projectId = this.projectContext.currentProjectId();
      if (user && projectId) this.tour.startIfNeeded(user);
    });
  }

  ngOnInit(): void {
    this.projectContext.load();
    this.version.load();
  }

  logout(): void {
    // Cancel the tour without marking it seen so a user who never finishes
    // still gets to see it again on the next login.
    this.tour.cancel();
    this.notifications.clear();
    this.projectContext.clear();
    this.auth.logout();
    void this.router.navigateByUrl('/login');
  }
}
