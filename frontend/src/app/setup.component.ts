import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { finalize } from 'rxjs';
import { SetupService } from './setup.service';

@Component({
  selector: 'app-setup',
  imports: [ButtonModule, CardModule, FormsModule, InputTextModule, PasswordModule],
  template: `
    <main class="setup-page">
      <p-card styleClass="setup-card">
        <img src="/Logo_SoftwareDue.svg" alt="Software Due" class="logo" />
        <h1>Configurazione iniziale</h1>
        <p>Crea la compagnia interna del team sviluppatori e il primo account admin.</p>
        <form #setupForm="ngForm" (ngSubmit)="save()" class="setup-form">
          <label>Compagnia team *</label>
          <input pInputText name="teamCompanyName" [(ngModel)]="draft.teamCompanyName" required maxlength="64" />
          <label>Username admin *</label>
          <input pInputText name="username" [(ngModel)]="draft.username" required maxlength="64" />
          <label>Email admin *</label>
          <input pInputText name="email" type="email" [(ngModel)]="draft.email" required email maxlength="128" />
          <label>Password admin *</label>
          <p-password name="password" [(ngModel)]="draft.password" [feedback]="false" [toggleMask]="true"
                      [style]="{ width: '100%' }" [inputStyle]="{ width: '100%' }" required minlength="12" />
          <div class="names">
            <div><label>Nome</label><input pInputText name="firstName" [(ngModel)]="draft.firstName" maxlength="32" /></div>
            <div><label>Cognome</label><input pInputText name="lastName" [(ngModel)]="draft.lastName" maxlength="32" /></div>
          </div>
          @if (error) { <p class="error">{{ error }}</p> }
          <p-button type="submit" label="Crea sistema" icon="pi pi-check" [loading]="saving"
                    [disabled]="setupForm.invalid || draft.password.length < 12 || saving" />
        </form>
      </p-card>
    </main>
  `,
  styles: [`
    .setup-page { min-height: 100vh; display: grid; place-items: center; padding: 24px; background: #f8fafc; }
    :host ::ng-deep .setup-card { width: min(560px, 96vw); }
    .logo { height: 54px; margin-bottom: 12px; }
    h1 { margin: 0 0 8px; color: #0f477e; }
    p { color: #64748b; }
    .setup-form { display: grid; gap: 10px; }
    label { font-weight: 700; color: #374151; }
    .names { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .names div { display: grid; gap: 10px; }
    .error { color: #b91c1c; font-weight: 700; }
    @media (max-width: 560px) { .names { grid-template-columns: 1fr; } }
  `]
})
export class SetupComponent implements OnInit {
  private readonly setup = inject(SetupService);
  private readonly router = inject(Router);
  saving = false;
  error = '';
  draft = { teamCompanyName: 'Software Due', username: 'admin', email: '', password: '', firstName: '', lastName: '' };

  ngOnInit(): void {
    this.setup.status().subscribe({ next: status => { if (!status.required) void this.router.navigateByUrl('/login'); } });
  }

  save(): void {
    if (this.saving) return;
    this.saving = true;
    this.error = '';
    this.setup.setup({
      teamCompanyName: this.draft.teamCompanyName.trim(),
      username: this.draft.username.trim(),
      email: this.draft.email.trim(),
      password: this.draft.password,
      firstName: this.draft.firstName.trim() || null,
      lastName: this.draft.lastName.trim() || null
    }).pipe(finalize(() => this.saving = false)).subscribe({
      next: () => void this.router.navigateByUrl('/login'),
      error: (error: unknown) => this.error = error instanceof HttpErrorResponse && error.status === 409
        ? 'Configurazione già completata.' : 'Non riesco a creare la configurazione iniziale.'
    });
  }
}
