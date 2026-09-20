import { DatePipe } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { BadgeModule } from 'primeng/badge';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { DatePickerModule } from 'primeng/datepicker';
import { InputTextModule } from 'primeng/inputtext';
import { MultiSelectModule } from 'primeng/multiselect';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { forkJoin } from 'rxjs';
import { AuthService } from './auth.service';
import {
  ISSUE_STATUSES,
  IssueField,
  IssueFieldOption,
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
import { SelectFilterValue, filterIssues } from './issue-filters';

interface SelectOption<T> {
  label: string;
  value: T;
}

interface SelectFieldFilter {
  field: IssueField;
  options: IssueFieldOption[];
}

@Component({
  selector: 'app-home',
  imports: [BadgeModule, ButtonModule, CardModule, DatePickerModule, DatePipe, FormsModule, InputTextModule, IssueCreateDialogComponent, IssueDetailDialogComponent, IssueReportDialogComponent, MultiSelectModule, SelectModule, TableModule, TagModule],
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
          @if (auth.user()?.role === 'ADMIN') {
            <p-button label="Eliminate" icon="pi pi-trash" severity="danger" [outlined]="true"
                      [disabled]="!projects.currentProjectId()" (onClick)="navigate('/eliminate')">
              @if (deletedCount() > 0) { <p-badge [value]="deletedCount()" severity="danger" /> }
            </p-button>
          }
          <p-button label="Archiviate" icon="pi pi-inbox" severity="secondary" [outlined]="true"
                    [disabled]="!projects.currentProjectId()" (onClick)="navigate('/archivio')">
            @if (archivedCount() > 0) { <p-badge [value]="archivedCount()" severity="info" /> }
          </p-button>
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
          @for (filter of selectFieldFilters(); track filter.field.id) {
            <label>
              <span>{{ filter.field.label }}</span>
              <p-multiselect [options]="filter.options" optionLabel="label" optionValue="value"
                             [ngModel]="selectFilterValueFor(filter.field.id)"
                             (ngModelChange)="setSelectFilter(filter.field.id, $event)"
                             [placeholder]="'Tutti'" [showClear]="false"
                             display="chip" appendTo="body" />
            </label>
          }
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
  private readonly router = inject(Router);
  readonly auth = inject(AuthService);

  readonly issues = signal<IssueSummary[]>([]);
  readonly users = signal<ProjectUserSummary[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly deletedCount = signal(0);
  readonly archivedCount = signal(0);
  readonly selectFieldFilters = signal<SelectFieldFilter[]>([]);
  createDialogVisible = false;
  reportDialogVisible = false;
  selectedIssueId: number | null = null;

  navigate(path: string): void {
    this.router.navigateByUrl(path);
  }

  textFilter = '';
  statusFilter: IssueStatus | 'ALL' = 'ALL';
  typeFilter: IssueSummary['issueType'] | 'ALL' | 'NONE' = 'ALL';
  issuerFilter: number | 'ALL' | 'NONE' = 'ALL';
  dateRange: Date[] | null = null;
  selectFilterValues: Record<number, string[] | null> = {};

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
      to: this.dateRange?.[1] ?? null,
      selectValues: this.activeSelectFilters()
    });
  }

  selectFilterValueFor(fieldId: number): string[] | null {
    return this.selectFilterValues[fieldId] ?? null;
  }

  setSelectFilter(fieldId: number, values: string[] | null): void {
    this.selectFilterValues[fieldId] = values && values.length > 0 ? values : null;
  }

  private activeSelectFilters(): Record<number, SelectFilterValue> {
    const filters: Record<number, SelectFilterValue> = {};
    for (const filter of this.selectFieldFilters()) {
      const selected = this.selectFilterValues[filter.field.id];
      if (selected && selected.length > 0) filters[filter.field.id] = selected;
    }
    return filters;
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
    const role = this.auth.user()?.role;
    const requests: { [key: string]: any } = {
      issues: this.issuesApi.issues(projectId),
      users: this.issuesApi.projectUsers(projectId),
      fields: this.issuesApi.issueFields(projectId),
      fieldOptions: this.issuesApi.issueFieldOptions(projectId),
      archived: this.issuesApi.archivedIssues(projectId)
    };
    if (role === 'ADMIN') {
      requests['deleted'] = this.issuesApi.deletedIssues(projectId);
    }
    forkJoin(requests).subscribe({
      next: (results: any) => {
        if (sequence !== this.loadSequence || projectId !== this.projects.currentProjectId()) return;
        this.issues.set(results['issues']);
        this.users.set(results['users']);
        this.archivedCount.set((results['archived'] as IssueSummary[]).length);
        this.deletedCount.set(results['deleted'] ? (results['deleted'] as IssueSummary[]).length : 0);
        this.updateSelectFieldFilters(results['fields'], results['fieldOptions']);
        this.loading.set(false);
      },
      error: () => {
        if (sequence !== this.loadSequence || projectId !== this.projects.currentProjectId()) return;
        this.error.set('Non riesco a caricare le segnalazioni.');
        this.loading.set(false);
      }
    });
  }

  private updateSelectFieldFilters(fields: IssueField[], options: IssueFieldOption[]): void {
    const selectFields = (fields ?? []).filter(field => field.type === 'SELECT');
    if (selectFields.length === 0) {
      this.selectFieldFilters.set([]);
      return;
    }
    const optionsByField = new Map<number, IssueFieldOption[]>();
    for (const option of options ?? []) {
      if (!option.active) continue;
      const list = optionsByField.get(option.definitionId) ?? [];
      list.push(option);
      optionsByField.set(option.definitionId, list);
    }
    this.selectFieldFilters.set(selectFields.map(field => ({
      field,
      options: (optionsByField.get(field.id) ?? [])
        .sort((a, b) => a.label.localeCompare(b.label, 'it'))
    })));
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
    this.selectFilterValues = {};
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
    this.deletedCount.set(0);
    this.archivedCount.set(0);
    this.selectFieldFilters.set([]);
    this.error.set(null);
    this.resetFilters();
  }

  private userLabel(user: ProjectUserSummary): string {
    const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ');
    return fullName ? fullName : user.username;
  }
}
