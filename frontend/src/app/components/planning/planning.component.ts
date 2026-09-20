import { DatePipe } from '@angular/common';
import { Component, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { SelectModule } from 'primeng/select';
import { TagModule } from 'primeng/tag';
import { forkJoin } from 'rxjs';
import { IssueDetailDialogComponent } from '../issue-detail-dialog/issue-detail-dialog.component';
import { IssuesService, TYPE_LABELS } from '../../services/issues/issues.service';
import type { IssueSummary, IssueType, ProjectUserSummary } from '../../services/issues/issues.service';
import { ProjectContextService } from '../../services/project-context/project-context.service';
import { LiveSyncService } from '../../services/live-sync/live-sync.service';
import { IssueNotificationsService } from '../../services/issue-notifications/issue-notifications.service';

interface PlanningColumn {
  title: string;
  type: IssueType | null;
  empty: string;
}

interface SelectOption<T> { label: string; value: T; }

@Component({
  selector: 'app-planning',
  imports: [ButtonModule, CardModule, DatePipe, FormsModule, IssueDetailDialogComponent, SelectModule, TagModule],
  template: `
    <p-card styleClass="planning-card">
      <div class="page-title">
        <div>
          <h1>Pianificazione</h1>
          @if (projects.currentProject(); as project) {
            <p>Classifica le segnalazioni e assegna lo sviluppatore per <strong>{{ project.name }}</strong>.</p>
          } @else {
            <p>Seleziona un progetto dall'header per pianificare le segnalazioni.</p>
          }
        </div>
        <p-button label="Aggiorna" icon="pi pi-refresh" severity="secondary" [outlined]="true"
                  [loading]="loading()" [disabled]="!projects.currentProjectId()" (onClick)="load()" />
      </div>

      @if (projects.currentProjectId()) {
        @if (error()) { <p class="error-message">{{ error() }}</p> }

        <section class="planning-board" aria-label="Pianificazione segnalazioni">
          @for (column of columns; track column.title) {
            <article class="planning-column" (dragover)="allowDrop($event)" (drop)="dropOnColumn(column)">
              <header>
                <span>{{ column.title }}</span>
                <p-tag [value]="issuesFor(column).length.toString()" severity="secondary" />
              </header>

              <div class="cards">
                @for (issue of issuesFor(column); track issue.id) {
                  <div class="planning-card-item" draggable="true" [class.internal-issue]="issue.internal"
                       [class.saving]="savingIssueId() === issue.id"
                       (dragstart)="startDrag(issue)" (click)="openDetail(issue)">
                    <div class="card-main">
                      <strong>#{{ issue.id }}
                        @if (notifications.isUnread(issue.id)) {
                          <span class="issue-unread-dot" title="Nuova o aggiornata" aria-label="Issue nuova o aggiornata"></span>
                        }
                      </strong>
                      <span>{{ issue.createdAt | date:'dd/MM/yyyy' }}</span>
                    </div>
                    <h2>{{ issue.title }}</h2>
                    <label class="developer-select" (click)="$event.stopPropagation()" (mousedown)="$event.stopPropagation()">
                      <span>Sviluppatore</span>
                      <p-select [options]="developerOptions" [ngModel]="issue.devUserId"
                                (ngModelChange)="setDeveloper(issue, $event)" optionLabel="label" optionValue="value"
                                placeholder="Non assegnato" appendTo="body" />
                    </label>
                  </div>
                } @empty {
                  <div class="empty-column">{{ column.empty }}</div>
                }
              </div>
            </article>
          }
        </section>
      }
      @if (selectedIssueId !== null) {
        <app-issue-detail-dialog [issueId]="selectedIssueId" (issueChanged)="onIssueChanged($event)" (issueDeleted)="onIssueDeleted($event)"
                                 (closed)="selectedIssueId = null" />
      }
    </p-card>
  `,
  styleUrl: './planning.component.css'
})
export class PlanningComponent {
  private readonly eventSync = inject(LiveSyncService);
  readonly projects = inject(ProjectContextService);
  private readonly issuesApi = inject(IssuesService);
  readonly notifications = inject(IssueNotificationsService);

  readonly issues = signal<IssueSummary[]>([]);
  readonly users = signal<ProjectUserSummary[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly savingIssueId = signal<number | null>(null);
  selectedIssueId: number | null = null;

  readonly columns: PlanningColumn[] = [
    { title: 'Da categorizzare', type: null, empty: 'Nessuna segnalazione da categorizzare.' },
    { title: TYPE_LABELS.ANOMALY, type: 'ANOMALY', empty: 'Nessuna anomalia segnalata.' },
    { title: TYPE_LABELS.IMPROVEMENT, type: 'IMPROVEMENT', empty: 'Nessuna miglioria segnalata.' },
    { title: TYPE_LABELS.IMPLEMENTATION, type: 'IMPLEMENTATION', empty: 'Nessuna implementazione segnalata.' }
  ];
  developerOptions: SelectOption<number | null>[] = [{ label: 'Non assegnato', value: null }];

  private draggedIssue: IssueSummary | null = null;
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
      if (projectChanged) {
        this.loadSequence++;
        this.issues.set([]);
        this.users.set([]);
        this.error.set(null);
      }
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
        this.developerOptions = [
          { label: 'Non assegnato', value: null },
          ...users.filter(user => user.role === 'TEAM').map(user => ({ label: this.userLabel(user), value: user.id }))
        ];
        this.loading.set(false);
      },
      error: () => {
        if (sequence !== this.loadSequence || projectId !== this.projects.currentProjectId()) return;
        this.error.set('Non riesco a caricare la pianificazione.');
        this.loading.set(false);
      }
    });
  }

  issuesFor(column: PlanningColumn): IssueSummary[] {
    return this.issues()
      .filter(issue => issue.status === 'REPORTED' && issue.issueType === column.type)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
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

  startDrag(issue: IssueSummary): void {
    this.draggedIssue = issue;
  }

  allowDrop(event: DragEvent): void {
    event.preventDefault();
  }

  dropOnColumn(column: PlanningColumn): void {
    const issue = this.draggedIssue;
    this.draggedIssue = null;
    if (!issue || column.type === null || issue.issueType === column.type || this.savingIssueId() !== null) return;
    this.savePlanning(issue, column.type, issue.devUserId);
  }

  setDeveloper(issue: IssueSummary, devUserId: number | null): void {
    if (this.savingIssueId() !== null) return;
    if (issue.issueType === null) {
      this.issues.update(items => items.map(item => item.id === issue.id ? { ...item, devUserId } : item));
      return;
    }
    this.savePlanning(issue, issue.issueType, devUserId);
  }

  private savePlanning(issue: IssueSummary, issueType: IssueType, devUserId: number | null): void {
    const previous = { issueType: issue.issueType, devUserId: issue.devUserId, devUsername: issue.devUsername };
    const devUsername = this.users().find(user => user.id === devUserId)?.username ?? null;
    this.savingIssueId.set(issue.id);
    this.error.set(null);
    this.issues.update(items => items.map(item => item.id === issue.id ? { ...item, issueType, devUserId, devUsername } : item));
    this.issuesApi.updatePlanning(issue.id, issueType, devUserId).subscribe({
      next: updated => {
        this.issues.update(items => items.map(item => item.id === updated.id ? updated : item));
        this.savingIssueId.set(null);
      },
      error: () => {
        this.issues.update(items => items.map(item => item.id === issue.id ? { ...item, ...previous } : item));
        this.error.set('Non riesco a salvare la pianificazione.');
        this.savingIssueId.set(null);
      }
    });
  }

  private userLabel(user: ProjectUserSummary): string {
    const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ');
    return fullName ? `${user.username} · ${fullName}` : user.username;
  }
}
