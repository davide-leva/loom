import { Component, OnInit, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MenuItem } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { MenuModule } from 'primeng/menu';
import { SelectModule } from 'primeng/select';
import { AuthService } from './auth.service';
import { ProjectContextService } from './project-context.service';

@Component({
  selector: 'app-main-layout',
  imports: [FormsModule, RouterLink, RouterLinkActive, RouterOutlet, ButtonModule, MenuModule, SelectModule],
  templateUrl: './main-layout.component.html',
  styleUrl: './main-layout.component.css'
})
export class MainLayoutComponent implements OnInit {
  readonly auth = inject(AuthService);
  readonly projectContext = inject(ProjectContextService);
  private readonly router = inject(Router);

  readonly userMenuItems = computed<MenuItem[]>(() => [
    { label: `Compagnia: ${this.auth.user()?.companyName ?? 'Software Due'}`, icon: 'pi pi-building', disabled: true },
    { separator: true },
    { label: 'Notifiche email', icon: 'pi pi-envelope', command: () => void this.router.navigateByUrl('/preferenze-email') },
    { label: 'Logout', icon: 'pi pi-sign-out', command: () => this.logout() }
  ]);

  ngOnInit(): void {
    this.projectContext.load();
  }

  logout(): void {
    this.projectContext.clear();
    this.auth.logout();
    void this.router.navigateByUrl('/login');
  }
}
