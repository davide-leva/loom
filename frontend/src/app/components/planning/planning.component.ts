import { DatePipe } from '@angular/common';
import { Component, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { SelectModule } from 'primeng/select';
import { TagModule } from 'primeng/tag';
import { forkJoin } from 'rxjs';
import { SegnalazioneDetailDialogComponent } from '../segnalazione-detail-dialog/segnalazione-detail-dialog.component';
import { SegnalazioniService, TYPE_LABELS } from '../../services/segnalazioni/segnalazioni.service';
import type { SegnalazioneSummary, TipoSegnalazione, ProjectUserSummary } from '../../services/segnalazioni/segnalazioni.service';
import { ProjectContextService } from '../../services/project-context/project-context.service';
import { LiveSyncService } from '../../services/live-sync/live-sync.service';
import { NotificheSegnalazioniService } from '../../services/notifiche-segnalazioni/notifiche-segnalazioni.service';

interface PlanningColumn {
  title: string;
  type: TipoSegnalazione | null;
  empty: string;
}

interface SelectOption<T> { label: string; value: T; }

@Component({
  selector: 'app-planning',
  imports: [ButtonModule, CardModule, DatePipe, FormsModule, SegnalazioneDetailDialogComponent, SelectModule, TagModule],
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
                @for (segnalazione of issuesFor(column); track segnalazione.id) {
                  <div class="planning-card-item" draggable="true" [class.segnalazione-interna]="segnalazione.internal"
                       [class.saving]="savingIssueId() === segnalazione.id"
                       (dragstart)="startDrag(segnalazione)" (click)="openDetail(segnalazione)">
                    <div class="card-main">
                      <strong>#{{ segnalazione.id }}
                        @if (notifications.isUnread(segnalazione.id)) {
                          <span class="pallino-non-letto-segnalazione" title="Nuova o aggiornata" aria-label="Segnalazione nuova o aggiornata"></span>
                        }
                      </strong>
                      <span>{{ segnalazione.createdAt | date:'dd/MM/yyyy' }}</span>
                    </div>
                    <h2>{{ segnalazione.title }}</h2>
                    <label class="developer-select" (click)="$event.stopPropagation()" (mousedown)="$event.stopPropagation()">
                      <span>Sviluppatore</span>
                      <p-select [options]="developerOptions" [ngModel]="segnalazione.devUserId"
                                (ngModelChange)="setDeveloper(segnalazione, $event)" optionLabel="label" optionValue="value"
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
      @if (segnalazioneSelezionataId !== null) {
        <app-segnalazione-detail-dialog [issueId]="segnalazioneSelezionataId" (issueChanged)="onSegnalazioneModificata($event)" (issueDeleted)="onSegnalazioneEliminata($event)"
                                 (closed)="segnalazioneSelezionataId = null" />
      }
    </p-card>
  `,
  styleUrl: './planning.component.css'
})
export class PlanningComponent {
  private readonly eventSync = inject(LiveSyncService);
  readonly projects = inject(ProjectContextService);
  private readonly segnalazioniApi = inject(SegnalazioniService);
  readonly notifications = inject(NotificheSegnalazioniService);

  readonly segnalazioni = signal<SegnalazioneSummary[]>([]);
  readonly users = signal<ProjectUserSummary[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly savingIssueId = signal<number | null>(null);
  segnalazioneSelezionataId: number | null = null;

  readonly columns: PlanningColumn[] = [
    { title: 'Da categorizzare', type: null, empty: 'Nessuna segnalazione da categorizzare.' },
    { title: TYPE_LABELS.ANOMALY, type: 'ANOMALY', empty: 'Nessuna anomalia segnalata.' },
    { title: TYPE_LABELS.IMPROVEMENT, type: 'IMPROVEMENT', empty: 'Nessuna miglioria segnalata.' },
    { title: TYPE_LABELS.IMPLEMENTATION, type: 'IMPLEMENTATION', empty: 'Nessuna implementazione segnalata.' }
  ];
  developerOptions: SelectOption<number | null>[] = [{ label: 'Non assegnato', value: null }];

  private draggedSegnalazione: SegnalazioneSummary | null = null;
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
        this.segnalazioni.set([]);
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
    forkJoin({ segnalazioni: this.segnalazioniApi.segnalazioni(projectId), users: this.segnalazioniApi.projectUsers(projectId) }).subscribe({
      next: ({ segnalazioni, users }) => {
        if (sequence !== this.loadSequence || projectId !== this.projects.currentProjectId()) return;
        this.segnalazioni.set(segnalazioni);
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

  issuesFor(column: PlanningColumn): SegnalazioneSummary[] {
    return this.segnalazioni()
      .filter(segnalazione => segnalazione.status === 'REPORTED' && segnalazione.issueType === column.type)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  openDetail(segnalazione: SegnalazioneSummary): void {
    this.segnalazioneSelezionataId = segnalazione.id;
  }

  onSegnalazioneModificata(segnalazione: SegnalazioneSummary): void {
    this.segnalazioni.update(items => items.map(item =>
      item.id === segnalazione.id ? segnalazione : item
    ));
  }

  onSegnalazioneEliminata(segnalazioneId: number): void {
    this.segnalazioni.update(items => items.filter(item => item.id !== segnalazioneId));
  }

  startDrag(segnalazione: SegnalazioneSummary): void {
    this.draggedSegnalazione = segnalazione;
  }

  allowDrop(event: DragEvent): void {
    event.preventDefault();
  }

  dropOnColumn(column: PlanningColumn): void {
    const issue = this.draggedSegnalazione;
    this.draggedSegnalazione = null;
    if (!issue || column.type === null || issue.issueType === column.type || this.savingIssueId() !== null) return;
    this.savePlanning(issue, column.type, issue.devUserId);
  }

  setDeveloper(issue: SegnalazioneSummary, devUserId: number | null): void {
    if (this.savingIssueId() !== null) return;
    if (issue.issueType === null) {
      this.segnalazioni.update(items => items.map(item => item.id === issue.id ? { ...item, devUserId } : item));
      return;
    }
    this.savePlanning(issue, issue.issueType, devUserId);
  }

  private savePlanning(issue: SegnalazioneSummary, issueType: TipoSegnalazione, devUserId: number | null): void {
    const previous = { issueType: issue.issueType, devUserId: issue.devUserId, devUsername: issue.devUsername };
    const devUsername = this.users().find(user => user.id === devUserId)?.username ?? null;
    this.savingIssueId.set(issue.id);
    this.error.set(null);
    this.segnalazioni.update(items => items.map(item => item.id === issue.id ? { ...item, issueType, devUserId, devUsername } : item));
    this.segnalazioniApi.aggiornaPianificazione(issue.id, issueType, devUserId).subscribe({
      next: updated => {
        this.segnalazioni.update(items => items.map(item => item.id === updated.id ? updated : item));
        this.savingIssueId.set(null);
      },
      error: () => {
        this.segnalazioni.update(items => items.map(item => item.id === issue.id ? { ...item, ...previous } : item));
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
