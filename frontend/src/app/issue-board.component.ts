import { DatePipe } from '@angular/common';
import { Component, ElementRef, HostListener, QueryList, ViewChild, ViewChildren, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { DatePickerModule } from 'primeng/datepicker';
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
import { LiveSyncService } from './live-sync.service';
import { filterIssues } from './issue-filters';
import { IssueNotificationsService } from './issue-notifications.service';

interface SelectOption<T> { label: string; value: T; }

@Component({
  selector: 'app-issue-board',
  imports: [ButtonModule, CardModule, DatePickerModule, DatePipe, FormsModule, InputTextModule, IssueCreateDialogComponent, IssueDetailDialogComponent, SelectModule, TagModule],
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

        <div class="kanban-floating-viewport" [class.is-visible]="floatingHeadersVisible"
             aria-hidden="true" [style.left.px]="floatingLeft" [style.width.px]="floatingWidth">
          <div class="kanban-floating-grid"
               [style.gridTemplateColumns]="floatingColumnWidths"
               [style.columnGap.px]="floatingColumnGap"
               [style.transform]="floatingTransform">
            @for (status of statuses; track status) {
              <div class="kanban-floating-header">
                <span>{{ statusLabel(status) }}</span>
                <p-tag [value]="issuesByStatus(status).length.toString()" severity="secondary" />
              </div>
            }
          </div>
        </div>

        <section #kanbanBoard class="kanban" aria-label="Kanban segnalazioni"
                 (scroll)="updateFloatingHeaders()">
          @for (status of statuses; track status) {
            <article #kanbanColumn class="kanban-column"
                     (dragover)="allowDrop($event)"
                     (drop)="dropOnStatus(status)">
              <header [class.is-detached]="floatingHeadersVisible">
                <span>{{ statusLabel(status) }}</span>
                <p-tag [value]="issuesByStatus(status).length.toString()" severity="secondary" />
              </header>

              <div class="cards">
                @for (issue of issuesByStatus(status); track issue.id) {
                  <div class="issue-card" draggable="true" [class.internal-issue]="issue.internal"
                       [class.saving]="savingIssueId() === issue.id"
                       (dragstart)="startDrag(issue)" (click)="openDetail(issue)">
                    <div class="card-head">
                      <strong>#{{ issue.id }}
                        @if (notifications.isUnread(issue.id)) {
                          <span class="issue-unread-dot" title="Nuova o aggiornata" aria-label="Issue nuova o aggiornata"></span>
                        }
                      </strong>
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
  private readonly eventSync = inject(LiveSyncService);
  readonly route = inject(ActivatedRoute);
  readonly projects = inject(ProjectContextService);
  private readonly issuesApi = inject(IssuesService);
  private readonly auth = inject(AuthService);
  readonly notifications = inject(IssueNotificationsService);

  readonly statuses = ISSUE_STATUSES;
  readonly issues = signal<IssueSummary[]>([]);
  readonly users = signal<ProjectUserSummary[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly savingIssueId = signal<number | null>(null);
  @ViewChild('kanbanBoard') private kanbanBoard?: ElementRef<HTMLElement>;
  @ViewChildren('kanbanColumn') private kanbanColumns?: QueryList<ElementRef<HTMLElement>>;
  createDialogVisible = false;
  selectedIssueId: number | null = null;
  floatingHeadersVisible = false;
  floatingLeft = 0;
  floatingWidth = 0;
  floatingColumnGap = 14;
  floatingColumnWidths = '';
  floatingTransform = 'translate3d(0, 0, 0)';

  textFilter = '';
  issuerFilter: number | 'ALL' | 'NONE' = 'ALL';
  developerFilter: number | 'ALL' | 'NONE' = 'ALL';
  dateRange: Date[] | null = null;

  private draggedIssue: IssueSummary | null = null;
  private lastProjectId: number | null = null;
  private lastType: IssueType | null = null;
  private lastRevision = -1;
  private loadSequence = 0;

  readonly issueType = computed<IssueType>(() => this.route.snapshot.data['issueType'] as IssueType);
  readonly title = computed(() => this.route.snapshot.data['title'] as string);

  readonly issuerOptions = computed<SelectOption<number | 'ALL' | 'NONE'>[]>(() => this.userOptions('Tutti'));
  readonly developerOptions = computed<SelectOption<number | 'ALL' | 'NONE'>[]>(() => this.userOptions('Tutti', 'TEAM'));

  filteredIssues(): IssueSummary[] {
    return filterIssues(this.issues(), {
      text: this.textFilter,
      type: this.issueType(),
      issuerId: this.issuerFilter,
      developerId: this.developerFilter,
      from: this.dateRange?.[0] ?? null,
      to: this.dateRange?.[1] ?? null
    });
  }

  constructor() {
    effect(() => {
      const projectId = this.projects.currentProjectId();
      const type = this.issueType();
      const revision = this.eventSync.revision();
      if (projectId === this.lastProjectId && type === this.lastType && revision === this.lastRevision) return;
      const projectChanged = projectId !== this.lastProjectId || type !== this.lastType;
      this.lastProjectId = projectId;
      this.lastType = type;
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
    this.dateRange = null;
  }

  issuesByStatus(status: IssueStatus): IssueSummary[] {
    return this.filteredIssues().filter(issue => issue.status === status);
  }

  @HostListener('window:scroll')
  @HostListener('window:resize')
  updateFloatingHeaders(): void {
    const board = this.kanbanBoard?.nativeElement;
    const columns = this.kanbanColumns?.toArray().map(item => item.nativeElement) ?? [];
    const headers = columns
      .map(column => column.querySelector<HTMLElement>(':scope > header'))
      .filter((header): header is HTMLElement => header !== null);
    const firstHeader = headers[0];
    if (!board || !firstHeader || headers.length === 0) {
      this.floatingHeadersVisible = false;
      return;
    }

    const top = 8;
    const boardRect = board.getBoundingClientRect();
    const headerRect = firstHeader.getBoundingClientRect();
    this.floatingHeadersVisible = headerRect.top <= top && boardRect.bottom > top + headerRect.height;
    if (!this.floatingHeadersVisible) return;

    const viewportLeft = Math.max(0, boardRect.left);
    const viewportRight = Math.min(window.innerWidth, boardRect.right);
    const columnStyle = window.getComputedStyle(columns[0]);
    const leftInset = Number.parseFloat(columnStyle.paddingLeft) || 0;
    this.floatingLeft = viewportLeft;
    this.floatingWidth = Math.max(0, viewportRight - viewportLeft);
    this.floatingColumnGap = headers.length > 1
      ? Math.max(0, headers[1].getBoundingClientRect().left - headers[0].getBoundingClientRect().right)
      : 0;
    this.floatingColumnWidths = headers.map(header => `${header.getBoundingClientRect().width}px`).join(' ');
    this.floatingTransform = `translate3d(${leftInset - board.scrollLeft}px, 0, 0)`;
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
      if (this.auth.user()?.role !== 'SUPERUSER' || issue.status !== 'RELEASED') {
        this.error.set('Solo un SUPERUSER può spostare una segnalazione rilasciata in Approvato.');
        return;
      }
    } else if (this.auth.user()?.role !== 'TEAM' && this.auth.user()?.role !== 'ADMIN') {
      this.error.set('Solo il team o un admin può cambiare lo stato della segnalazione.');
      return;
    }

    const previousStatus = issue.status;
    this.savingIssueId.set(issue.id);
    this.issues.update(items => items.map(item => item.id === issue.id ? { ...item, status } : item));
    const request = status === 'APPROVED'
      ? this.issuesApi.approveIssue(issue.id)
      : this.issuesApi.updateStatus(issue.id, status);
    request.subscribe({
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
    this.loadSequence++;
    this.issues.set([]);
    this.users.set([]);
    this.error.set(null);
    this.resetFilters();
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
    return fullName ? fullName : user.username;
  }
}
