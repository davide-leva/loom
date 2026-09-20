import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { FileSelectEvent, FileUploadModule } from 'primeng/fileupload';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { SelectModule } from 'primeng/select';
import { finalize } from 'rxjs';
import { BRAND_COLORS } from '../../shared/brand-colors';
import { SetupService } from '../../services/setup/setup.service';

@Component({
  selector: 'app-setup',
  imports: [ButtonModule, CardModule, FileUploadModule, FormsModule, InputTextModule, PasswordModule, SelectModule],
  template: `
    <main class="setup-page">
      <p-card styleClass="setup-card">
        <h1>Configurazione iniziale</h1>
        <p>Crea la compagnia interna del team sviluppatori e il primo account admin.</p>
        <form #setupForm="ngForm" (ngSubmit)="save()" class="setup-form">
          <label>Compagnia team *</label>
          <input pInputText name="teamCompanyName" [(ngModel)]="draft.teamCompanyName" required maxlength="64" />
          <label>Colore principale *</label>
          <p-select name="primaryColor" [options]="colors" [(ngModel)]="draft.primaryColor" />
          <label>Logo della compagnia (opzionale)</label>
          <p-fileupload mode="advanced" styleClass="app-file-upload" [multiple]="false" [customUpload]="true"
                        [showUploadButton]="false" [auto]="false" [maxFileSize]="2097152"
                        accept=".png,.jpg,.jpeg,.webp,.svg,image/png,image/jpeg,image/webp,image/svg+xml"
                        chooseLabel="Seleziona logo" cancelLabel="Rimuovi"
                        invalidFileSizeMessageSummary="File troppo grande"
                        invalidFileSizeMessageDetail="Il logo non può superare 2 MB."
                        (onSelect)="selectLogo($event)" (onClear)="logo = null" (onRemove)="logo = null" />
          <label>Username admin *</label>
          <input pInputText name="username" [(ngModel)]="draft.username" required maxlength="64" />
          <label>Email admin *</label>
          <input pInputText name="email" type="email" [(ngModel)]="draft.email" required email maxlength="128" />
          <label>Password admin *</label>
          <p-password name="password" [(ngModel)]="draft.password" [feedback]="false" [toggleMask]="true"
                      [style]="{ width: '100%' }" [inputStyle]="{ width: '100%' }" required minlength="8" />
          <div class="names">
            <div><label>Nome</label><input pInputText name="firstName" [(ngModel)]="draft.firstName" maxlength="32" /></div>
            <div><label>Cognome</label><input pInputText name="lastName" [(ngModel)]="draft.lastName" maxlength="32" /></div>
          </div>
          @if (error) { <p class="error">{{ error }}</p> }
          <p-button type="submit" label="Crea sistema" icon="pi pi-check" [loading]="saving"
                    [disabled]="setupForm.invalid || draft.password.length < 8 || saving" />
        </form>
      </p-card>
    </main>
  `,
  styles: [`
    .setup-page { min-height: 100vh; display: grid; place-items: center; padding: 24px; background: #f8fafc; }
    :host ::ng-deep .setup-card { width: min(560px, 96vw); }
    h1 { margin: 0 0 8px; color: var(--p-primary-700); }
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
  readonly colors = [...BRAND_COLORS];
  logo: File | null = null;
  draft = { teamCompanyName: '', primaryColor: 'blue', username: 'admin',
    email: '', password: '', firstName: '', lastName: '' };

  selectLogo(event: FileSelectEvent): void {
    this.logo = event.currentFiles[event.currentFiles.length - 1] ?? null;
  }

  ngOnInit(): void {
    this.setup.status().subscribe({ next: status => { if (!status.required) void this.router.navigateByUrl('/login'); } });
  }

  save(): void {
    if (this.saving) return;
    this.saving = true;
    this.error = '';
    this.setup.setup({
      teamCompanyName: this.draft.teamCompanyName.trim(),
      primaryColor: this.draft.primaryColor,
      username: this.draft.username.trim(),
      email: this.draft.email.trim(),
      password: this.draft.password,
      firstName: this.draft.firstName.trim() || null,
      lastName: this.draft.lastName.trim() || null
    }, this.logo).pipe(finalize(() => this.saving = false)).subscribe({
      next: () => void this.router.navigateByUrl('/login'),
      error: (error: unknown) => this.error = error instanceof HttpErrorResponse && error.status === 409
        ? 'Configurazione già completata.' : 'Non riesco a creare la configurazione iniziale.'
    });
  }
}
