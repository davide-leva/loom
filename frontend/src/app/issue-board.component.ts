import { DatePipe } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TagModule } from 'primeng/tag';
import { forkJoin } from 'rxjs';
import { AuthService } from './auth.service';
import { IssueCreateDialogComponent } from './issue-create-dialog.component';
import { IssueDetailDialogComponent } from './issue-detail-dialog.component';
import {
  ISSUE_STATUSES,
  IssueStatus,
  IssueSummary,
  IssueType,
  IssuesService,
  ProjectUserSummary,
  STATUS_LABELS,
  TYPE_LABELS
} from './issues.service';
import { ProjectContextService } from './project-context.service';

interface SelectOption<T> { label: string; value: T; }

@Component({
  selector: 'app-issue-board',
  imports: [ButtonModule, CardModule, DatePipe, FormsModule, InputTextModule, IssueCreateDialogComponent, IssueDetailDialogComponent, SelectModule, TagModule],
  template: `
    <p-card styleClass="board-card">
      <div class="page-title">
        <div>
          <h1>{{ title() }}</h1>
          @if (projects.currentProject(); as project) {
            <p>Kanban {{ typeLabel(issueType()) }} del progetto <strong>{{ project.name }}</strong></p>
          } @else {
            <p>Seleziona un progetto dall'header per vedere la kanban.</p>
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
        <section class="filters" aria-label="Filtri kanban">
          <label>
            <span>Cerca</span>
            <input pInputText type="search" [(ngModel)]="textFilter" placeholder="ID, titolo, descrizione..." />
          </label>
          <label>
            <span>Segnalatore</span>
            <p-select [options]="issuerOptions()" [(ngModel)]="issuerFilter" optionLabel="label" optionValue="value"
                      appendTo="body" />
          </label>
          <label>
            <span>Sviluppatore</span>
            <p-select [options]="developerOptions()" [(ngModel)]="developerFilter" optionLabel="label" optionValue="value"
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

        <section class="kanban" aria-label="Kanban segnalazioni">
          @for (status of statuses; track status) {
            <article class="kanban-column"
                     (dragover)="allowDrop($event)"
                     (drop)="dropOnStatus(status)">
              <header>
                <span>{{ statusLabel(status) }}</span>
                <p-tag [value]="issuesByStatus(status).length.toString()" severity="secondary" />
              </header>

              <div class="cards">
                @for (issue of issuesByStatus(status); track issue.id) {
                  <div class="issue-card" draggable="true"
                       [class.saving]="savingIssueId() === issue.id"
                       (dragstart)="startDrag(issue)" (click)="openDetail(issue)">
                    <div class="card-head">
                      <strong>#{{ issue.id }}</strong>
                      <p-tag [value]="statusLabel(issue.status)" [severity]="statusSeverity(issue.status)" />
                    </div>
                    <h2>{{ issue.title }}</h2>
                    <p>{{ issue.description }}</p>
                    <dl>
                      <div>
                        <dt>Segnalatore</dt>
                        <dd>{{ issue.issuerUsername || 'Non assegnato' }}</dd>
                      </div>
                      <div>
                        <dt>Data</dt>
                        <dd>{{ issue.createdAt | date:'dd/MM/yyyy HH:mm' }}</dd>
                      </div>
                      @if (issue.devUsername) {
                        <div>
                          <dt>Sviluppatore</dt>
                          <dd>{{ issue.devUsername }}</dd>
                        </div>
                      }
                    </dl>
                  </div>
                } @empty {
                  <div class="empty-column">Nessuna issue</div>
                }
              </div>
            </article>
          }
        </section>
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
  styleUrl: './issue-board.component.css'
})
export class IssueBoardComponent {
  readonly route = inject(ActivatedRoute);
  readonly projects = inject(ProjectContextService);
  private readonly issuesApi = inject(IssuesService);
  private readonly auth = inject(AuthService);

  readonly statuses = ISSUE_STATUSES;
  readonly issues = signal<IssueSummary[]>([]);
  readonly users = signal<ProjectUserSummary[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly savingIssueId = signal<number | null>(null);
  createDialogVisible = false;
  selectedIssueId: number | null = null;

  textFilter = '';
  issuerFilter: number | 'ALL' | 'NONE' = 'ALL';
  developerFilter: number | 'ALL' | 'NONE' = 'ALL';
  fromDate = '';
  toDate = '';

  private draggedIssue: IssueSummary | null = null;
  private lastProjectId: number | null = null;
  private lastType: IssueType | null = null;

  readonly issueType = computed<IssueType>(() => this.route.snapshot.data['issueType'] as IssueType);
  readonly title = computed(() => this.route.snapshot.data['title'] as string);

  readonly issuerOptions = computed<SelectOption<number | 'ALL' | 'NONE'>[]>(() => this.userOptions('Tutti'));
  readonly developerOptions = computed<SelectOption<number | 'ALL' | 'NONE'>[]>(() => this.userOptions('Tutti', 'TEAM'));

  filteredIssues(): IssueSummary[] {
    const text = this.textFilter.trim().toLowerCase();
    const type = this.issueType();
    const from = this.fromDate ? new Date(`${this.fromDate}T00:00:00`).getTime() : null;
    const to = this.toDate ? new Date(`${this.toDate}T23:59:59`).getTime() : null;
    return this.issues().filter(issue => {
      if (issue.issueType !== type) return false;
      if (this.issuerFilter === 'NONE' && issue.issuerUserId !== null) return false;
      if (typeof this.issuerFilter === 'number' && issue.issuerUserId !== this.issuerFilter) return false;
      if (this.developerFilter === 'NONE' && issue.devUserId !== null) return false;
      if (typeof this.developerFilter === 'number' && issue.devUserId !== this.developerFilter) return false;
      const created = new Date(issue.createdAt).getTime();
      if (from !== null && created < from) return false;
      if (to !== null && created > to) return false;
      if (!text) return true;
      return [issue.id.toString(), issue.title, issue.description, issue.issuerUsername ?? '', issue.devUsername ?? '']
        .some(value => value.toLowerCase().includes(text));
    });
  }

  constructor() {
    effect(() => {
      const projectId = this.projects.currentProjectId();
      const type = this.issueType();
      if (projectId === this.lastProjectId && type === this.lastType) return;
      this.lastProjectId = projectId;
      this.lastType = type;
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
        this.error.set('Non riesco a caricare la kanban.');
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
    this.issuerFilter = 'ALL';
    this.developerFilter = 'ALL';
    this.fromDate = '';
    this.toDate = '';
    this.applyDefaultIssuerFilter();
  }

  issuesByStatus(status: IssueStatus): IssueSummary[] {
    return this.filteredIssues().filter(issue => issue.status === status);
  }

  startDrag(issue: IssueSummary): void {
    this.draggedIssue = issue;
  }

  allowDrop(event: DragEvent): void {
    event.preventDefault();
  }

  dropOnStatus(status: IssueStatus): void {
    const issue = this.draggedIssue;
    this.draggedIssue = null;
    if (!issue || issue.status === status || this.savingIssueId() !== null) return;
    if (status === 'APPROVED' && issue.status !== 'APPROVED') {
      this.error.set('Lo stato Approvato può essere impostato solo dal SUPERUSER dal dettaglio della segnalazione rilasciata.');
      return;
    }

    const previousStatus = issue.status;
    this.savingIssueId.set(issue.id);
    this.issues.update(items => items.map(item => item.id === issue.id ? { ...item, status } : item));
    this.issuesApi.updateStatus(issue.id, status).subscribe({
      next: updated => {
        this.issues.update(items => items.map(item => item.id === updated.id ? updated : item));
        this.savingIssueId.set(null);
      },
      error: () => {
        this.issues.update(items => items.map(item => item.id === issue.id ? { ...item, status: previousStatus } : item));
        this.error.set('Non riesco a salvare il cambio stato.');
        this.savingIssueId.set(null);
      }
    });
  }

  statusLabel(status: IssueStatus): string { return STATUS_LABELS[status]; }
  typeLabel(type: IssueType): string { return TYPE_LABELS[type]; }

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

  private userOptions(allLabel: string, role?: ProjectUserSummary['role']): SelectOption<number | 'ALL' | 'NONE'>[] {
    const users = role ? this.users().filter(user => user.role === role) : this.users();
    return [
      { label: allLabel, value: 'ALL' },
      { label: 'Non assegnato', value: 'NONE' },
      ...users.map(user => ({ label: this.userLabel(user), value: user.id }))
    ];
  }

  private userLabel(user: ProjectUserSummary): string {
    const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ');
    return fullName ? `${user.username} · ${fullName}` : user.username;
  }
}
