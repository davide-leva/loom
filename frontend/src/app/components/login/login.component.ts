import { Location } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { finalize } from 'rxjs';
import { AuthService } from '../../services/auth/auth.service';
import { ProjectContextService } from '../../services/project-context/project-context.service';
import { SetupService } from '../../services/setup/setup.service';
import { applyBrandColor } from '../../shared/brand-colors';

@Component({
  selector: 'app-login',
  imports: [FormsModule, ButtonModule, CardModule, InputTextModule, PasswordModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css'
})
export class LoginComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly setup = inject(SetupService);
  private readonly route = inject(ActivatedRoute);
  private readonly location = inject(Location);
  private readonly projects = inject(ProjectContextService);
  private readonly http = inject(HttpClient);
  internalBrand: { name: string; primaryColor: string; logoUrl: string | null } =
    { name: 'Tickets', primaryColor: 'blue', logoUrl: null };

  username = '';
  password = '';
  loading = false;
  error = '';

  ngOnInit(): void {
    this.http.get<typeof this.internalBrand>('/api/branding/internal').subscribe({
      next: brand => {
        this.internalBrand = brand;
        if (!this.auth.user()) applyBrandColor(brand.primaryColor);
      }
    });
    const externalToken = this.route.snapshot.queryParamMap.get('t');
    if (externalToken !== null) {
      this.location.replaceState('/login');
      this.loading = true;
      this.auth.loginExternal(externalToken).pipe(finalize(() => this.loading = false)).subscribe({
        next: projectId => {
          this.projects.rememberExternalProject(projectId);
          void this.router.navigateByUrl('/');
        },
        error: (error: unknown) => {
          this.error = error instanceof HttpErrorResponse && error.status === 401
            ? 'Token di accesso esterno non valido o scaduto.'
            : 'Accesso con token non disponibile. Verifica che il backend sia aggiornato e raggiungibile.';
        }
      });
    }
    this.setup.status().subscribe({ next: status => { if (status.required) void this.router.navigateByUrl('/setup'); } });
  }

  login(): void {
    if (!this.username.trim() || !this.password || this.loading) {
      return;
    }
    this.error = '';
    this.loading = true;
    this.auth.login(this.username, this.password).pipe(
      finalize(() => this.loading = false)
    ).subscribe({
      next: () => void this.router.navigateByUrl('/'),
      error: (error: unknown) => {
        this.error = error instanceof HttpErrorResponse && (error.status === 401 || error.status === 403)
          ? 'Username o password non validi.'
          : 'Accesso non disponibile. Verifica che il backend sia avviato e riprova.';
      }
    });
  }
}