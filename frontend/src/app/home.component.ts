import { DatePipe } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { DatePickerModule } from 'primeng/datepicker';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { forkJoin } from 'rxjs';
import {
  ISSUE_STATUSES,
  IssueStatus,
  IssueSummary,
  IssuesService,
  ProjectUserSummary,
  STATUS_LABELS,
  TYPE_LABELS
} from './issues.service';
import { IssueCreateDialogComponent } from './issue-create-dialog.component';
import { IssueDetailDialogComponent } from './issue-detail-dialog.component';
import { IssueReportDialogComponent } from './issue-report-dialog.component';
import { ProjectContextService } from './project-context.service';
import { LiveSyncService } from './live-sync.service';
import { filterIssues } from './issue-filters';

interface SelectOption<T> {
  label: string;
  value: T;
}

@Component({
  selector: 'app-home',
  imports: [ButtonModule, CardModule, DatePickerModule, DatePipe, FormsModule, InputTextModule, IssueCreateDialogComponent, IssueDetailDialogComponent, IssueReportDialogComponent, SelectModule, TableModule, TagModule],
  template: `
    <p-card styleClass="dashboard-card">
      <div class="page-title">
        <div>
          <h1>Dashboard</h1>
          @if (projects.currentProject(); as project) {
            <p>Segnalazioni del progetto <strong>{{ project.name }}</strong></p>
          } @else {
            <p>Seleziona un progetto dall'header per vedere le segnalazioni.</p>
          }
        </div>
        <div class="page-actions">
          <p-button label="Report PDF" icon="pi pi-file-pdf" severity="primary" [outlined]="true"
                    [disabled]="!projects.currentProjectId()" (onClick)="reportDialogVisible = true" />
          <p-button label="Nuova segnalazione" icon="pi pi-plus" [disabled]="!projects.currentProjectId()"
                    (onClick)="openCreateDialog()" />
          <p-button label="Aggiorna" icon="pi pi-refresh" severity="secondary" [outlined]="true"
                    [loading]="loading()" [disabled]="!projects.currentProjectId()" (onClick)="load()" />
        </div>
      </div>

      @if (projects.currentProjectId()) {
        <section class="filters" aria-label="Filtri dashboard">
          <label>
            <span>Cerca</span>
            <input pInputText type="search" [(ngModel)]="textFilter" placeholder="ID, titolo, segnalatore..." />
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
          <p-button label="Pulisci" icon="pi pi-filter-slash" severity="secondary" [outlined]="true" (onClick)="resetFilters()" />
        </section>

        @if (error()) {
          <p class="error-message">{{ error() }}</p>
        }

        <p-table [value]="filteredIssues()" [loading]="loading()" [paginator]="true" [rows]="12"
                 [rowsPerPageOptions]="[12, 25, 50]" [sortField]="'createdAt'" [sortOrder]="-1"
                 responsiveLayout="scroll" styleClass="issue-table">
          <ng-template pTemplate="header">
            <tr>
              <th pSortableColumn="id">ID <p-sortIcon field="id" /></th>
              <th pSortableColumn="title">Titolo <p-sortIcon field="title" /></th>
              <th pSortableColumn="status">Stato <p-sortIcon field="status" /></th>
              <th pSortableColumn="issueType">Tipologia <p-sortIcon field="issueType" /></th>
              <th pSortableColumn="issuerUsername">Segnalatore <p-sortIcon field="issuerUsername" /></th>
              <th pSortableColumn="createdAt">Data segnalazione <p-sortIcon field="createdAt" /></th>
            </tr>
          </ng-template>
          <ng-template pTemplate="body" let-issue>
            <tr class="clickable-row" [class.internal-issue]="issue.internal" (click)="openDetail(issue)">
              <td class="id-cell">#{{ issue.id }}</td>
              <td>{{ issue.title }}</td>
              <td><p-tag [value]="statusLabel(issue.status)" [severity]="statusSeverity(issue.status)" /></td>
              <td>{{ typeLabel(issue.issueType) }}</td>
              <td>{{ issue.issuerUsername || 'Non assegnato' }}</td>
              <td>{{ issue.createdAt | date:'dd/MM/yyyy HH:mm' }}</td>
            </tr>
          </ng-template>
          <ng-template pTemplate="emptymessage">
            <tr><td colspan="6">Nessuna segnalazione trovata.</td></tr>
          </ng-template>
        </p-table>
      }

      @if (createDialogVisible) {
        <app-issue-create-dialog [projectId]="projects.currentProjectId()" [users]="users()"
                                 (created)="onIssueCreated($event)" (closed)="createDialogVisible = false" />
      }
      @if (selectedIssueId !== null) {
        <app-issue-detail-dialog [issueId]="selectedIssueId" (issueChanged)="onIssueChanged($event)" (issueDeleted)="onIssueDeleted($event)"
                                 (closed)="selectedIssueId = null" />
      }
      @if (reportDialogVisible) {
        <app-issue-report-dialog [projectId]="projects.currentProjectId()" [users]="users()"
                                 (closed)="reportDialogVisible = false" />
      }
    </p-card>
  `,
  styleUrl: './home.component.css'
})
export class HomeComponent {
  readonly projects = inject(ProjectContextService);
  private readonly issuesApi = inject(IssuesService);
  private readonly eventSync = inject(LiveSyncService);

  readonly issues = signal<IssueSummary[]>([]);
  readonly users = signal<ProjectUserSummary[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  createDialogVisible = false;
  reportDialogVisible = false;
  selectedIssueId: number | null = null;

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

  readonly issuerOptions = computed<SelectOption<number | 'ALL' | 'NONE'>[]>(() => [
    { label: 'Tutti', value: 'ALL' },
    { label: 'Non assegnato', value: 'NONE' },
    ...this.users().map(user => ({ label: this.userLabel(user), value: user.id }))
  ]);

  filteredIssues(): IssueSummary[] {
    return filterIssues(this.issues(), {
      text: this.textFilter,
      status: this.statusFilter,
      type: this.typeFilter,
      issuerId: this.issuerFilter,
      from: this.dateRange?.[0] ?? null,
      to: this.dateRange?.[1] ?? null
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
    forkJoin({ issues: this.issuesApi.issues(projectId), users: this.issuesApi.projectUsers(projectId) }).subscribe({
      next: ({ issues, users }) => {
        if (sequence !== this.loadSequence || projectId !== this.projects.currentProjectId()) return;
        this.issues.set(issues);
        this.users.set(users);
        this.loading.set(false);
      },
      error: () => {
        if (sequence !== this.loadSequence || projectId !== this.projects.currentProjectId()) return;
        this.error.set('Non riesco a caricare le segnalazioni.');
        this.loading.set(false);
      }
    });
  }

  openCreateDialog(): void {
    this.createDialogVisible = true;
  }

  onIssueCreated(issue: IssueSummary): void {
    this.issues.update(items => [issue, ...items]);
  }

  openDetail(issue: IssueSummary): void {
    this.selectedIssueId = issue.id;
  }

  onIssueChanged(issue: IssueSummary): void {
    this.issues.update(items => items.map(item => item.id === issue.id ? issue : item));
  }

  onIssueDeleted(issueId: number): void {
    this.issues.update(items => items.filter(item => item.id !== issueId));
  }

  resetFilters(): void {
    this.textFilter = '';
    this.statusFilter = 'ALL';
    this.typeFilter = 'ALL';
    this.issuerFilter = 'ALL';
    this.dateRange = null;
  }

  statusLabel(status: IssueStatus): string { return STATUS_LABELS[status]; }
  typeLabel(type: IssueSummary['issueType']): string { return type === null ? 'Non categorizzata' : TYPE_LABELS[type]; }

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

  private resetForProject(): void {
    this.loadSequence++;
    this.issues.set([]);
    this.users.set([]);
    this.error.set(null);
    this.resetFilters();
  }

  private userLabel(user: ProjectUserSummary): string {
    const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ');
    return fullName ? fullName : user.username;
  }
}
