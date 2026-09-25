import { DatePipe } from '@angular/common';
import { Component, ElementRef, HostListener, QueryList, ViewChild, ViewChildren, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { DatePickerModule } from 'primeng/datepicker';
import { InputTextModule } from 'primeng/inputtext';
import { MultiSelectModule } from 'primeng/multiselect';
import { SelectModule } from 'primeng/select';
import { TagModule } from 'primeng/tag';
import { forkJoin } from 'rxjs';
import { AuthService } from '../../services/auth/auth.service';
import { SegnalazioneCreateDialogComponent } from '../segnalazione-create-dialog/segnalazione-create-dialog.component';
import { SegnalazioneDetailDialogComponent } from '../segnalazione-detail-dialog/segnalazione-detail-dialog.component';
import { SegnalazioniService, SEGNALAZIONE_STATUS, STATUS_LABELS, TYPE_LABELS } from '../../services/segnalazioni/segnalazioni.service';
import type { SegnalazioneCampo, SegnalazioneCampoOpzione, StatusSegnalazione, SegnalazioneSummary, TipoSegnalazione, ProjectUserSummary } from '../../services/segnalazioni/segnalazioni.service';
import { ProjectContextService } from '../../services/project-context/project-context.service';
import { LiveSyncService } from '../../services/live-sync/live-sync.service';
import { SelectFilterValue, filtraSegnalazioni } from '../../services/segnalazioni/segnalazione-filtri';
import { NotificheSegnalazioniService } from '../../services/notifiche-segnalazioni/notifiche-segnalazioni.service';

interface SelectOption<T> { label: string; value: T; }

interface SelectFieldFilter {
  field: SegnalazioneCampo;
  options: SegnalazioneCampoOpzione[];
}

@Component({
  selector: 'app-segnalazioni-board',
  imports: [ButtonModule, CardModule, DatePickerModule, DatePipe, FormsModule, InputTextModule, SegnalazioneCreateDialogComponent, SegnalazioneDetailDialogComponent, MultiSelectModule, SelectModule, TagModule],
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
        <section class="filters" aria-label="Filtri kanban" data-onboarding="board-filters">
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

        <section #kanbanBoard class="kanban" aria-label="Kanban segnalazioni" data-onboarding="board-columns"
                 (scroll)="updateFloatingHeaders()">
          @for (status of statuses; track status) {
            <article #kanbanColumn class="kanban-column"
                     [attr.data-onboarding]="status === 'APPROVED' ? 'board-approved-column' : null"
                     (dragover)="allowDrop($event)"
                     (drop)="dropOnStatus(status)">
              <header [class.is-detached]="floatingHeadersVisible">
                <span>{{ statusLabel(status) }}</span>
                <p-tag [value]="issuesByStatus(status).length.toString()" severity="secondary" />
              </header>

              <div class="cards">
                @for (segnalazione of issuesByStatus(status); track segnalazione.id) {
                  <div class="card-segnalazione" draggable="true" [class.segnalazione-interna]="segnalazione.internal"
                       [class.saving]="savingIssueId() === segnalazione.id"
                       (dragstart)="startDrag(segnalazione)" (click)="openDetail(segnalazione)">
                    <div class="card-head">
                      <strong>#{{ segnalazione.id }}
                        @if (notifications.isUnread(segnalazione.id)) {
                          <span class="pallino-non-letto-segnalazione" title="Nuova o aggiornata" aria-label="Segnalazione nuova o aggiornata"></span>
                        }
                      </strong>
                      <p-tag [value]="statusLabel(segnalazione.status)" [severity]="statusSeverity(segnalazione.status)" />
                    </div>
                    <h2>{{ segnalazione.title }}</h2>
                    <p>{{ segnalazione.description }}</p>
                    <dl>
                      <div>
                        <dt>Segnalatore</dt>
                        <dd>{{ segnalazione.issuerUsername || 'Non assegnato' }}</dd>
                      </div>
                      <div>
                        <dt>Data</dt>
                        <dd>{{ segnalazione.createdAt | date:'dd/MM/yyyy HH:mm' }}</dd>
                      </div>
                      @if (segnalazione.devUsername) {
                        <div>
                          <dt>Sviluppatore</dt>
                          <dd>{{ segnalazione.devUsername }}</dd>
                        </div>
                      }
                    </dl>
                  </div>
                } @empty {
                  <div class="empty-column">Nessuna segnalazione</div>
                }
              </div>
            </article>
          }
        </section>
      }

      @if (createDialogVisible) {
        <app-segnalazione-create-dialog [projectId]="projects.currentProjectId()" [users]="users()"
                                 (created)="onSegnalazioneCreata($event)" (closed)="createDialogVisible = false" />
      }
      @if (segnalazioneSelezionataId !== null) {
        <app-segnalazione-detail-dialog [issueId]="segnalazioneSelezionataId" (issueChanged)="onSegnalazioneModificata($event)" (issueDeleted)="onSegnalazioneEliminata($event)"
                                 (closed)="segnalazioneSelezionataId = null" />
      }
    </p-card>
  `,
  styleUrl: './segnalazioni-board.component.css'
})
export class SegnalazioniBoardComponent {
  private readonly eventSync = inject(LiveSyncService);
  readonly route = inject(ActivatedRoute);
  readonly projects = inject(ProjectContextService);
  private readonly segnalazioniApi = inject(SegnalazioniService);
  private readonly auth = inject(AuthService);
  readonly notifications = inject(NotificheSegnalazioniService);

  readonly statuses = SEGNALAZIONE_STATUS;
  readonly segnalazioni = signal<SegnalazioneSummary[]>([]);
  readonly users = signal<ProjectUserSummary[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly savingIssueId = signal<number | null>(null);
  readonly selectFieldFilters = signal<SelectFieldFilter[]>([]);
  @ViewChild('kanbanBoard') private kanbanBoard?: ElementRef<HTMLElement>;
  @ViewChildren('kanbanColumn') private kanbanColumns?: QueryList<ElementRef<HTMLElement>>;
  createDialogVisible = false;
  segnalazioneSelezionataId: number | null = null;
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
  selectFilterValues: Record<number, string[] | null> = {};

  private draggedSegnalazione: SegnalazioneSummary | null = null;
  private lastProjectId: number | null = null;
  private lastType: TipoSegnalazione | null = null;
  private lastRevision = -1;
  private loadSequence = 0;

  readonly issueType = computed<TipoSegnalazione>(() => this.route.snapshot.data['issueType'] as TipoSegnalazione);
  readonly title = computed(() => this.route.snapshot.data['title'] as string);

  readonly issuerOptions = computed<SelectOption<number | 'ALL' | 'NONE'>[]>(() => this.userOptions('Tutti'));
  readonly developerOptions = computed<SelectOption<number | 'ALL' | 'NONE'>[]>(() => this.userOptions('Tutti', 'TEAM'));

  segnalazioniFiltrate(): SegnalazioneSummary[] {
    return filtraSegnalazioni(this.segnalazioni(), {
      text: this.textFilter,
      type: this.issueType(),
      issuerId: this.issuerFilter,
      developerId: this.developerFilter,
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
    forkJoin({
      segnalazioni: this.segnalazioniApi.segnalazioni(projectId),
      users: this.segnalazioniApi.projectUsers(projectId),
      fields: this.segnalazioniApi.segnalazioneCampi(projectId),
      fieldOptions: this.segnalazioniApi.segnalazioneCampoOpzioni(projectId)
    }).subscribe({
      next: ({ segnalazioni: segnalazioni, users, fields, fieldOptions }) => {
        if (sequence !== this.loadSequence || projectId !== this.projects.currentProjectId()) return;
        this.segnalazioni.set(segnalazioni);
        this.users.set(users);
        this.updateSelectFieldFilters(fields, fieldOptions);
        this.loading.set(false);
      },
      error: () => {
        if (sequence !== this.loadSequence || projectId !== this.projects.currentProjectId()) return;
        this.error.set('Non riesco a caricare la kanban.');
        this.loading.set(false);
      }
    });
  }

  private updateSelectFieldFilters(fields: SegnalazioneCampo[], options: SegnalazioneCampoOpzione[]): void {
    const selectFields = (fields ?? []).filter(field => field.type === 'SELECT');
    if (selectFields.length === 0) {
      this.selectFieldFilters.set([]);
      return;
    }
    const optionsByField = new Map<number, SegnalazioneCampoOpzione[]>();
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

  onSegnalazioneCreata(segnalazione: SegnalazioneSummary): void {
    this.segnalazioni.update(items => [segnalazione, ...items]);
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

  resetFilters(): void {
    this.textFilter = '';
    this.issuerFilter = 'ALL';
    this.developerFilter = 'ALL';
    this.dateRange = null;
    this.selectFilterValues = {};
  }

  issuesByStatus(status: StatusSegnalazione): SegnalazioneSummary[] {
    return this.segnalazioniFiltrate().filter(segnalazione => segnalazione.status === status);
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

  startDrag(segnalazione: SegnalazioneSummary): void {
    this.draggedSegnalazione = segnalazione;
  }

  allowDrop(event: DragEvent): void {
    event.preventDefault();
  }

  dropOnStatus(status: StatusSegnalazione): void {
    const segnalazione = this.draggedSegnalazione;
    this.draggedSegnalazione = null;
    if (!segnalazione || segnalazione.status === status || this.savingIssueId() !== null) return;
    if (status === 'APPROVED' && segnalazione.status !== 'APPROVED') {
      const role = this.auth.user()?.role;
      const isSuperuser = role === 'SUPERUSER';
      const isAdminOnInternal = role === 'ADMIN' && segnalazione.internal;
      if (!isSuperuser && !isAdminOnInternal) {
        this.error.set('Solo un SUPERUSER (o un ADMIN per segnalazioni interne) può spostare in Approvato.');
        return;
      }
      if (segnalazione.status !== 'RELEASED') {
        this.error.set('Solo le segnalazioni rilasciate possono essere approvate.');
        return;
      }
    } else if (this.auth.user()?.role !== 'TEAM' && this.auth.user()?.role !== 'ADMIN') {
      this.error.set('Solo il team o un admin può cambiare lo stato della segnalazione.');
      return;
    }

    const previousStatus = segnalazione.status;
    this.savingIssueId.set(segnalazione.id);
    this.segnalazioni.update(items => items.map(item => item.id === segnalazione.id ? { ...item, status } : item));
    const request = status === 'APPROVED'
      ? this.segnalazioniApi.approvaSegnalazione(segnalazione.id)
      : this.segnalazioniApi.updateStatus(segnalazione.id, status);
    request.subscribe({
      next: updated => {
        this.segnalazioni.update(items => items.map(item => item.id === updated.id ? updated : item));
        this.savingIssueId.set(null);
      },
      error: () => {
        this.segnalazioni.update(items => items.map(item => item.id === segnalazione.id ? { ...item, status: previousStatus } : item));
        this.error.set('Non riesco a salvare il cambio stato.');
        this.savingIssueId.set(null);
      }
    });
  }

  statusLabel(status: StatusSegnalazione): string { return STATUS_LABELS[status]; }
  typeLabel(type: TipoSegnalazione): string { return TYPE_LABELS[type]; }

  statusSeverity(status: StatusSegnalazione): 'secondary' | 'info' | 'warn' | 'success' | 'contrast' {
    const severities: Record<StatusSegnalazione, 'secondary' | 'info' | 'warn' | 'success' | 'contrast'> = {
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
    this.segnalazioni.set([]);
    this.users.set([]);
    this.selectFieldFilters.set([]);
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
