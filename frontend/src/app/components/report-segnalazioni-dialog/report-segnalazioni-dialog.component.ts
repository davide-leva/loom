import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { AuthService } from '../../services/auth/auth.service';
import { SegnalazioniService, SEGNALAZIONE_STATUS, STATUS_LABELS, TYPE_LABELS } from '../../services/segnalazioni/segnalazioni.service';
import type { StatusSegnalazione, TipoSegnalazione, ProjectUserSummary } from '../../services/segnalazioni/segnalazioni.service';

interface Option<T> { label: string; value: T; }
type AssignmentFilter = number | 'ALL' | 'NONE';
type TypeFilter = TipoSegnalazione | 'ALL' | 'NONE';
type VisibilityFilter = 'ALL' | 'PUBLIC' | 'INTERNAL';

@Component({
  selector: 'app-report-segnalazioni-dialog',
  imports: [ButtonModule, DatePickerModule, DialogModule, FormsModule, InputTextModule, SelectModule],
  template: `
    <p-dialog header="Report segnalazioni" [(visible)]="visible" [modal]="true"
              [style]="{ width: '820px', maxWidth: '96vw' }" [breakpoints]="{ '720px': '96vw' }"
              [draggable]="false" [resizable]="false" (onHide)="closed.emit()">
      <form class="report-form" (ngSubmit)="generate()">
        <p class="intro">Seleziona i filtri da applicare al PDF. Lascia “Tutti” per non limitare il risultato.</p>
        <div class="filters">
          <label class="wide">
            <span>Cerca</span>
            <input pInputText name="report-search" type="search" [(ngModel)]="search"
                   placeholder="ID, titolo, descrizione, utente..." />
          </label>
          <label>
            <span>Stato</span>
            <p-select name="report-status" [options]="statusOptions" [(ngModel)]="status"
                      optionLabel="label" optionValue="value" appendTo="body" />
          </label>
          <label>
            <span>Tipologia</span>
            <p-select name="report-type" [options]="typeOptions" [(ngModel)]="type"
                      optionLabel="label" optionValue="value" appendTo="body" />
          </label>
          <label>
            <span>Segnalatore</span>
            <p-select name="report-issuer" [options]="issuerOptions()" [(ngModel)]="issuer"
                      optionLabel="label" optionValue="value" [filter]="true" filterBy="label" appendTo="body" />
          </label>
          <label>
            <span>Sviluppatore</span>
            <p-select name="report-developer" [options]="developerOptions()" [(ngModel)]="developer"
                      optionLabel="label" optionValue="value" [filter]="true" filterBy="label" appendTo="body" />
          </label>
          @if (canSeeVisibility()) {
            <label>
              <span>Visibilità</span>
              <p-select name="report-visibility" [options]="visibilityOptions" [(ngModel)]="visibility"
                        optionLabel="label" optionValue="value" appendTo="body" />
            </label>
          }
          <label>
            <span>Periodo di creazione</span>
            <p-datepicker name="report-period" [(ngModel)]="dateRange" selectionMode="range"
                          dateFormat="dd/mm/yy" [showIcon]="true" [showButtonBar]="true"
                          placeholder="Seleziona intervallo" appendTo="body" />
          </label>
        </div>

        @if (error) { <p class="error-message">{{ error }}</p> }

        <div class="dialog-actions">
          <p-button type="button" label="Annulla" severity="secondary" [outlined]="true"
                    [disabled]="generating" (onClick)="close()" />
          <p-button type="submit" label="Genera PDF" icon="pi pi-file-pdf" [loading]="generating" />
        </div>
      </form>
    </p-dialog>
  `,
  styles: [`
    .report-form { display: grid; gap: 18px; padding-top: 4px; }
    .intro { margin: 0; color: #64748b; }
    .filters { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
    label { display: flex; flex-direction: column; gap: 6px; color: #64748b; font-size: 13px; font-weight: 700; }
    label.wide { grid-column: 1 / -1; }
    input { width: 100%; }
    .dialog-actions { display: flex; justify-content: flex-end; gap: 10px; }
    .error-message { margin: 0; color: #b91c1c; font-weight: 700; }
    :host ::ng-deep .p-select, :host ::ng-deep .p-datepicker { width: 100%; }
    @media (max-width: 620px) { .filters { grid-template-columns: 1fr; } label.wide { grid-column: auto; } }
  `]
})
export class ReportSegnalazioniDialogComponent {
  private readonly segnalazioniApi = inject(SegnalazioniService);
  private readonly auth = inject(AuthService);

  @Input({ required: true }) projectId: number | null = null;
  @Input() users: ProjectUserSummary[] = [];
  @Output() closed = new EventEmitter<void>();

  /**
   * Only ADMIN and TEAM users see internal issues, so the visibility filter is meaningful
   * for them. USER and SUPERUSER don't see internal issues anyway, so the filter is hidden.
   */
  canSeeVisibility(): boolean {
    const role = this.auth.user()?.role;
    return role === 'ADMIN' || role === 'TEAM';
  }

  visible = true;
  generating = false;
  error = '';
  search = '';
  status: StatusSegnalazione | 'ALL' = 'ALL';
  type: TypeFilter = 'ALL';
  issuer: AssignmentFilter = 'ALL';
  developer: AssignmentFilter = 'ALL';
  visibility: VisibilityFilter = 'ALL';
  dateRange: Date[] | null = null;

  readonly statusOptions: Option<StatusSegnalazione | 'ALL'>[] = [
    { label: 'Tutti', value: 'ALL' },
    ...SEGNALAZIONE_STATUS.map(status => ({ label: STATUS_LABELS[status], value: status }))
  ];
  readonly typeOptions: Option<TypeFilter>[] = [
    { label: 'Tutte', value: 'ALL' },
    { label: 'Non categorizzate', value: 'NONE' },
    { label: TYPE_LABELS.ANOMALY, value: 'ANOMALY' },
    { label: TYPE_LABELS.IMPROVEMENT, value: 'IMPROVEMENT' },
    { label: TYPE_LABELS.IMPLEMENTATION, value: 'IMPLEMENTATION' }
  ];
  readonly visibilityOptions: Option<VisibilityFilter>[] = [
    { label: 'Tutte', value: 'ALL' },
    { label: 'Pubbliche', value: 'PUBLIC' },
    { label: 'Interne', value: 'INTERNAL' }
  ];

  issuerOptions(): Option<AssignmentFilter>[] {
    return this.userOptions(this.users);
  }

  developerOptions(): Option<AssignmentFilter>[] {
    return this.userOptions(this.users.filter(user => user.role === 'TEAM'));
  }

  generate(): void {
    if (this.projectId === null || this.generating) return;
    const projectId = this.projectId;
    const from = this.dateRange?.[0] ? this.startOfDay(this.dateRange[0]).toISOString() : undefined;
    const to = this.dateRange?.[1] ? this.dayAfter(this.dateRange[1]).toISOString() : undefined;
    this.generating = true;
    this.error = '';
    this.segnalazioniApi.scaricaReportSegnalazioni(projectId, {
      search: this.search.trim() || undefined,
      status: this.status === 'ALL' ? undefined : this.status,
      issueType: this.type === 'ALL' || this.type === 'NONE' ? undefined : this.type,
      uncategorized: this.type === 'NONE' || undefined,
      issuerId: typeof this.issuer === 'number' ? this.issuer : undefined,
      issuerUnassigned: this.issuer === 'NONE' || undefined,
      developerId: typeof this.developer === 'number' ? this.developer : undefined,
      developerUnassigned: this.developer === 'NONE' || undefined,
      internal: this.canSeeVisibility()
        ? (this.visibility === 'ALL' ? undefined : this.visibility === 'INTERNAL')
        : undefined,
      from, to
    }).subscribe({
      next: pdf => {
        this.generating = false;
        this.save(pdf, `report-segnalazioni-${projectId}.pdf`);
        this.close();
      },
      error: () => {
        this.generating = false;
        this.error = 'Non riesco a generare il report PDF.';
      }
    });
  }

  close(): void {
    this.visible = false;
    this.closed.emit();
  }

  private userOptions(users: ProjectUserSummary[]): Option<AssignmentFilter>[] {
    return [
      { label: 'Tutti', value: 'ALL' },
      { label: 'Non assegnato', value: 'NONE' },
      ...users.map(user => ({ label: this.userLabel(user), value: user.id }))
    ];
  }

  private userLabel(user: ProjectUserSummary): string {
    const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ');
    return fullName ? `${fullName} (${user.username})` : user.username;
  }

  private startOfDay(value: Date): Date {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }

  private dayAfter(value: Date): Date {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate() + 1);
  }

  private save(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }
}
