import { DatePipe } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { forkJoin } from 'rxjs';
import { AuthService } from './auth.service';
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
import { ProjectContextService } from './project-context.service';

interface SelectOption<T> {
  label: string;
  value: T;
}

@Component({
  selector: 'app-home',
  imports: [ButtonModule, CardModule, DatePipe, FormsModule, InputTextModule, IssueCreateDialogComponent, IssueDetailDialogComponent, SelectModule, TableModule, TagModule],
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
          <label>
            <span>Da</span>
            <input pInputText type="date" [(ngModel)]="fromDate" />
          </label>
          <label>
            <span>A</span>
            <input pInputText type="date" [(ngModel)]="toDate" />
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
            <tr class="clickable-row" (click)="openDetail(issue)">
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
    </p-card>
  `,
  styleUrl: './home.component.css'
})
export class HomeComponent {
  readonly projects = inject(ProjectContextService);
  private readonly issuesApi = inject(IssuesService);
  private readonly auth = inject(AuthService);

  readonly issues = signal<IssueSummary[]>([]);
  readonly users = signal<ProjectUserSummary[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  createDialogVisible = false;
  selectedIssueId: number | null = null;

  textFilter = '';
  statusFilter: IssueStatus | 'ALL' = 'ALL';
  typeFilter: IssueSummary['issueType'] | 'ALL' | 'NONE' = 'ALL';
  issuerFilter: number | 'ALL' | 'NONE' = 'ALL';
  fromDate = '';
  toDate = '';

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
    const text = this.textFilter.trim().toLowerCase();
    const from = this.fromDate ? new Date(`${this.fromDate}T00:00:00`).getTime() : null;
    const to = this.toDate ? new Date(`${this.toDate}T23:59:59`).getTime() : null;
    return this.issues().filter(issue => {
      if (this.statusFilter !== 'ALL' && issue.status !== this.statusFilter) return false;
      if (this.typeFilter === 'NONE' && issue.issueType !== null) return false;
      if (this.typeFilter !== 'ALL' && this.typeFilter !== 'NONE' && issue.issueType !== this.typeFilter) return false;
      if (this.issuerFilter === 'NONE' && issue.issuerUserId !== null) return false;
      if (typeof this.issuerFilter === 'number' && issue.issuerUserId !== this.issuerFilter) return false;
      const created = new Date(issue.createdAt).getTime();
      if (from !== null && created < from) return false;
      if (to !== null && created > to) return false;
      if (!text) return true;
      return [issue.id.toString(), issue.title, issue.issuerUsername ?? '', STATUS_LABELS[issue.status], this.typeLabel(issue.issueType)]
        .some(value => value.toLowerCase().includes(text));
    });
  }

  private lastProjectId: number | null = null;

  constructor() {
    effect(() => {
      const projectId = this.projects.currentProjectId();
      if (projectId === this.lastProjectId) return;
      this.lastProjectId = projectId;
      this.resetForProject();
      if (projectId) this.load();
    });
  }

  load(): void {
    const projectId = this.projects.currentProjectId();
    if (!projectId) return;
    this.loading.set(true);
    this.error.set(null);
    forkJoin({ issues: this.issuesApi.issues(projectId), users: this.issuesApi.projectUsers(projectId) }).subscribe({
      next: ({ issues, users }) => {
        this.issues.set(issues);
        this.users.set(users);
        this.applyDefaultIssuerFilter();
        this.loading.set(false);
      },
      error: () => {
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
    this.fromDate = '';
    this.toDate = '';
    this.applyDefaultIssuerFilter();
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
    this.issues.set([]);
    this.users.set([]);
    this.error.set(null);
    this.resetFilters();
  }

  private applyDefaultIssuerFilter(): void {
    const user = this.auth.user();
    if (user?.role === 'USER') this.issuerFilter = user.id;
  }

  private userLabel(user: ProjectUserSummary): string {
    const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ');
    return fullName ? `${user.username} · ${fullName}` : user.username;
  }
}
