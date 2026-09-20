import { DatePipe } from '@angular/common';
import { Component, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ConfirmationService, MessageService } from 'primeng/api';
import { DatePickerModule } from 'primeng/datepicker';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { IssuesService, ISSUE_STATUSES, STATUS_LABELS, TYPE_LABELS } from '../../services/issues/issues.service';
import type { IssueStatus, IssueSummary, ProjectUserSummary } from '../../services/issues/issues.service';
import { ProjectContextService } from '../../services/project-context/project-context.service';
import { LiveSyncService } from '../../services/live-sync/live-sync.service';
import { filterIssues } from '../../services/issues/issue-filters';

interface SelectOption<T> {
  label: string;
  value: T;
}

@Component({
  selector: 'app-deleted-issues',
  imports: [ButtonModule, CardModule, ConfirmDialogModule, DatePickerModule, DatePipe, FormsModule,
            InputTextModule, SelectModule, TableModule, TagModule, ToastModule],
  providers: [ConfirmationService, MessageService],
  template: `
    <p-card styleClass="dashboard-card">
      <div class="page-title">
        <div>
          <h1>Issue eliminate</h1>
          @if (projects.currentProject(); as project) {
            <p>Segnalazioni soft-delete del progetto <strong>{{ project.name }}</strong></p>
          } @else {
            <p>Seleziona un progetto dall'header per vedere le segnalazioni eliminate.</p>
          }
        </div>
        <div class="page-actions">
          <p-button label="Elimina selezionate" icon="pi pi-trash" severity="danger"
                    [disabled]="selected.length === 0 || deleting()" [loading]="deleting()"
                    (onClick)="confirmPermanentDelete()" />
          <p-button label="Aggiorna" icon="pi pi-refresh" severity="secondary" [outlined]="true"
                    [loading]="loading()" [disabled]="!projects.currentProjectId()" (onClick)="load()" />
          <p-button label="Dashboard" icon="pi pi-arrow-left" severity="secondary" [outlined]="true"
                    (onClick)="back()" />
        </div>
      </div>

      @if (projects.currentProjectId()) {
        <section class="filters" aria-label="Filtri eliminate">
          <label>
            <span>Cerca</span>
            <input pInputText type="search" [(ngModel)]="textFilter"
                   placeholder="ID, titolo, segnalatore..." />
          </label>
          <label>
            <span>Stato</span>
            <p-select [options]="statusOptions" [(ngModel)]="statusFilter" optionLabel="label" optionValue="value"
                      appendTo="body" />
          </label>
          <label>
            <span>Tipologia</span>
            <p-select [options]="typeOptions" [(ngModel)]="typeFilter" optionLabel="label" optionValue="value"
                      appendTo="body" />
          </label>
          <label>
            <span>Segnalatore</span>
            <p-select [options]="issuerOptions()" [(ngModel)]="issuerFilter" optionLabel="label" optionValue="value"
                      appendTo="body" />
          </label>
          <label class="date-range-filter">
            <span>Periodo</span>
            <p-datepicker [(ngModel)]="dateRange" selectionMode="range" dateFormat="dd/mm/yy"
                          [showIcon]="true" [showButtonBar]="true" appendTo="body"
                          placeholder="Seleziona intervallo" />
          </label>
          <p-button label="Pulisci" icon="pi pi-filter-slash" severity="secondary" [outlined]="true"
                    (onClick)="resetFilters()" />
        </section>

        @if (error()) { <p class="error-message">{{ error() }}</p> }

        <p-table [value]="filteredIssues()" [(selection)]="selected" selectionMode="multiple" dataKey="id"
                 [loading]="loading()" responsiveLayout="scroll" styleClass="issue-table">
          <ng-template pTemplate="header">
            <tr>
              <th style="width:3rem"><p-tableHeaderCheckbox /></th>
              <th pSortableColumn="id">ID <p-sortIcon field="id" /></th>
              <th pSortableColumn="title">Titolo <p-sortIcon field="title" /></th>
              <th pSortableColumn="status">Stato <p-sortIcon field="status" /></th>
              <th pSortableColumn="issueType">Tipologia <p-sortIcon field="issueType" /></th>
              <th pSortableColumn="issuerUsername">Segnalatore <p-sortIcon field="issuerUsername" /></th>
              <th pSortableColumn="createdAt">Data segnalazione <p-sortIcon field="createdAt" /></th>
              <th pSortableColumn="deletedAt">Data eliminazione <p-sortIcon field="deletedAt" /></th>
            </tr>
          </ng-template>
          <ng-template pTemplate="body" let-issue>
            <tr [class.internal-issue]="issue.internal">
              <td><p-tableCheckbox [value]="issue" /></td>
              <td class="id-cell">#{{ issue.id }}</td>
              <td>{{ issue.title }}</td>
              <td><p-tag [value]="statusLabel(issue.status)" [severity]="statusSeverity(issue.status)" /></td>
              <td>{{ typeLabel(issue.issueType) }}</td>
              <td>{{ issue.issuerUsername || 'Non assegnato' }}</td>
              <td>{{ issue.createdAt | date:'dd/MM/yyyy HH:mm' }}</td>
              <td>{{ issue.deletedAt | date:'dd/MM/yyyy HH:mm' }}</td>
            </tr>
          </ng-template>
          <ng-template pTemplate="emptymessage">
            <tr><td colspan="8">Nessuna segnalazione eliminata.</td></tr>
          </ng-template>
        </p-table>
      }

      <p-confirmDialog />
      <p-toast />
    </p-card>
  `,
  styleUrl: '../home/home.component.css'
})
export class DeletedIssuesComponent {
  readonly projects = inject(ProjectContextService);
  private readonly issuesApi = inject(IssuesService);
  private readonly eventSync = inject(LiveSyncService);
  private readonly router = inject(Router);
  private readonly confirmation = inject(ConfirmationService);
  private readonly messages = inject(MessageService);

  readonly issues = signal<IssueSummary[]>([]);
  readonly users = signal<ProjectUserSummary[]>([]);
  readonly loading = signal(false);
  readonly deleting = signal(false);
  readonly error = signal<string | null>(null);
  selected: IssueSummary[] = [];

  textFilter = '';
  statusFilter: IssueStatus | 'ALL' = 'ALL';
  typeFilter: IssueSummary['issueType'] | 'ALL' | 'NONE' = 'ALL';
  issuerFilter: number | 'ALL' | 'NONE' = 'ALL';
  dateRange: Date[] | null = null;

  readonly statusOptions: SelectOption<IssueStatus | 'ALL'>[] = [
    { label: 'Tutti', value: 'ALL' },
    ...ISSUE_STATUSES.map(status => ({ label: STATUS_LABELS[status], value: status }))
  ];
  readonly typeOptions: SelectOption<IssueSummary['issueType'] | 'ALL' | 'NONE'>[] = [
    { label: 'Tutte', value: 'ALL' },
    { label: 'Non categorizzate', value: 'NONE' },
    { label: TYPE_LABELS.ANOMALY, value: 'ANOMALY' },
    { label: TYPE_LABELS.IMPROVEMENT, value: 'IMPROVEMENT' },
    { label: TYPE_LABELS.IMPLEMENTATION, value: 'IMPLEMENTATION' }
  ];

  readonly issuerOptions = (): SelectOption<number | 'ALL' | 'NONE'>[] => [
    { label: 'Tutti', value: 'ALL' },
    { label: 'Non assegnato', value: 'NONE' },
    ...this.users().map(user => ({ label: this.userLabel(user), value: user.id }))
  ];

  filteredIssues(): IssueSummary[] {
    // excludeDeleted:false — we want to see deleted issues here.
    return filterIssues(this.issues(), {
      text: this.textFilter,
      status: this.statusFilter,
      type: this.typeFilter,
      issuerId: this.issuerFilter,
      from: this.dateRange?.[0] ?? null,
      to: this.dateRange?.[1] ?? null,
      excludeDeleted: false,
      excludeArchived: true
    });
  }

  private lastProjectId: number | null = null;
  private lastRevision = -1;
  private loadSequence = 0;

  constructor() {
    effect(() => {
      const projectId = this.projects.currentProjectId();
      const revision = this.eventSync.revision();
      if (projectId === this.lastProjectId && revision === this.lastRevision) return;
      const projectChanged = projectId !== this.lastProjectId;
      this.lastProjectId = projectId;
      this.lastRevision = revision;
      if (projectChanged) this.resetForProject();
      if (projectId) this.load();
    });
  }

  load(): void {
    const projectId = this.projects.currentProjectId();
    if (!projectId) return;
    const sequence = ++this.loadSequence;
    this.loading.set(true);
    this.error.set(null);
    this.issuesApi.deletedIssues(projectId).subscribe({
      next: (issues: IssueSummary[]) => {
        if (sequence !== this.loadSequence || projectId !== this.projects.currentProjectId()) return;
        this.issues.set(issues);
        this.users.set([]);
        this.selected = [];
        this.loading.set(false);
      },
      error: () => {
        if (sequence !== this.loadSequence || projectId !== this.projects.currentProjectId()) return;
        this.error.set('Non riesco a caricare le segnalazioni eliminate.');
        this.loading.set(false);
      }
    });
  }

  confirmPermanentDelete(): void {
    if (this.selected.length === 0) return;
    this.confirmation.confirm({
      header: 'Eliminazione definitiva',
      message: `Stai per eliminare definitivamente ${this.selected.length} segnalazion${this.selected.length === 1 ? 'e' : 'i'}. L'operazione non è reversibile.`,
      acceptLabel: 'Elimina',
      rejectLabel: 'Annulla',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => this.permanentlyDelete()
    });
  }

  private permanentlyDelete(): void {
    const ids = this.selected.map(issue => issue.id);
    if (ids.length === 0) return;
    this.deleting.set(true);
    this.issuesApi.permanentlyDeleteIssues(ids).subscribe({
      next: () => {
        this.deleting.set(false);
        this.messages.add({ severity: 'success', summary: 'Eliminazione completata',
          detail: `${ids.length} segnalazion${ids.length === 1 ? 'e' : 'i'} eliminata definitivamente.` });
        this.load();
      },
      error: () => {
        this.deleting.set(false);
        this.messages.add({ severity: 'error', summary: 'Errore',
          detail: 'Non riesco a completare l\'eliminazione definitiva.' });
      }
    });
  }

  resetFilters(): void {
    this.textFilter = '';
    this.statusFilter = 'ALL';
    this.typeFilter = 'ALL';
    this.issuerFilter = 'ALL';
    this.dateRange = null;
  }

  statusLabel(status: IssueStatus): string { return STATUS_LABELS[status]; }
  typeLabel(type: IssueSummary['issueType']): string {
    return type === null ? 'Non categorizzata' : TYPE_LABELS[type];
  }

  statusSeverity(status: IssueStatus): 'secondary' | 'info' | 'warn' | 'success' | 'contrast' {
    const severities: Record<IssueStatus, 'secondary' | 'info' | 'warn' | 'success' | 'contrast'> = {
      REPORTED: 'info',
      IN_PROGRESS: 'warn',
      COMPLETED: 'success',
      RELEASED: 'secondary',
      APPROVED: 'contrast'
    };
    return severities[status];
  }

  back(): void {
    this.router.navigateByUrl('/dashboard');
  }

  private resetForProject(): void {
    this.loadSequence++;
    this.issues.set([]);
    this.users.set([]);
    this.selected = [];
    this.error.set(null);
    this.resetFilters();
  }

  private userLabel(user: ProjectUserSummary): string {
    const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ');
    return fullName ? fullName : user.username;
  }
}
