import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { EmailPreferences, EmailPreferencesService } from './email-preferences.service';

type TriState = boolean | null;

@Component({
  selector: 'app-email-preferences',
  imports: [ButtonModule, CardModule, FormsModule, SelectModule, TableModule],
  template: `
    <p-card>
      <div class="page-title">
        <div>
          <h1>Notifiche email</h1>
          <p>Gestisci le preferenze globali e per progetto.</p>
        </div>
        <p-button label="Salva" icon="pi pi-check" [loading]="saving" [disabled]="loading || !preferences" (onClick)="save()" />
      </div>

      @if (loading) {
        <p>Carico preferenze...</p>
      } @else if (preferences) {
        <section class="preference-section">
          <label>
            <span>Comunicazioni email globali</span>
            <p-select [options]="options" [(ngModel)]="preferences.globalWantEmail" optionLabel="label" optionValue="value" />
          </label>
        </section>

        <p-table [value]="preferences.projects" styleClass="p-datatable-sm">
          <ng-template pTemplate="header">
            <tr><th>Progetto</th><th>Notifiche progetto</th></tr>
          </ng-template>
          <ng-template pTemplate="body" let-row>
            <tr>
              <td>{{ row.projectName }}</td>
              <td>
                <p-select [options]="options" [(ngModel)]="row.wantEmail" optionLabel="label" optionValue="value" appendTo="body" />
              </td>
            </tr>
          </ng-template>
          <ng-template pTemplate="emptymessage">
            <tr><td colspan="2">Nessun progetto disponibile.</td></tr>
          </ng-template>
        </p-table>
      }

      @if (message) { <p class="message">{{ message }}</p> }
      @if (error) { <p class="error-message">{{ error }}</p> }
    </p-card>
  `,
  styles: [`
    h1 { margin: 0; color: #0f477e; font-size: 24px; }
    .page-title { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; margin-bottom: 22px; }
    .page-title p { margin: 6px 0 0; color: #64748b; }
    .preference-section { margin-bottom: 20px; max-width: 420px; }
    label { display: flex; flex-direction: column; gap: 8px; color: #374151; font-weight: 700; }
    .message { color: #15803d; font-weight: 700; }
    .error-message { color: #b91c1c; font-weight: 700; }
    :host ::ng-deep .p-select { width: min(100%, 320px); }
  `]
})
export class EmailPreferencesComponent implements OnInit {
  private readonly api = inject(EmailPreferencesService);

  preferences: EmailPreferences | null = null;
  loading = false;
  saving = false;
  message = '';
  error = '';

  readonly options: { label: string; value: TriState }[] = [
    { label: 'Default', value: null },
    { label: 'Si', value: true },
    { label: 'No', value: false }
  ];

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading = true;
    this.error = '';
    this.api.get().subscribe({
      next: preferences => { this.preferences = preferences; this.loading = false; },
      error: () => { this.error = 'Non riesco a caricare le preferenze.'; this.loading = false; }
    });
  }

  save(): void {
    if (!this.preferences || this.saving) return;
    this.saving = true;
    this.message = '';
    this.error = '';
    this.api.update(this.preferences).subscribe({
      next: preferences => {
        this.preferences = preferences;
        this.message = 'Preferenze salvate.';
        this.saving = false;
      },
      error: () => {
        this.error = 'Non riesco a salvare le preferenze.';
        this.saving = false;
      }
    });
  }
}
