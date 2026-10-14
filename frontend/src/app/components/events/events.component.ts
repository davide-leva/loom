import { DatePipe } from '@angular/common';
import { Component, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { DatePickerModule } from 'primeng/datepicker';
import { SelectModule } from 'primeng/select';
import { SegnalazioneDetailDialogComponent } from '../segnalazione-detail-dialog/segnalazione-detail-dialog.component';
import { EventActor, EventType, EventsService, WorkspaceEvent } from '../../services/events/events.service';
import { ProjectContextService } from '../../services/project-context/project-context.service';
import { LiveSyncService } from '../../services/live-sync/live-sync.service';

interface Option<T> { label: string; value: T; }

const labels: Record<EventType, string> = {
  ISSUE_CREATED: 'Segnalazione creata',
  ISSUE_PLANNED: 'Pianificazione aggiornata',
  ISSUE_STATUS_CHANGED: 'Stato modificato',
  ISSUE_APPROVED: 'Segnalazione approvata',
  ISSUE_COMMENT_ADDED: 'Commento aggiunto',
  ISSUE_COMMENT_DELETED: 'Commento eliminato',
  ISSUE_ATTACHMENT_UPLOADED: 'Allegato caricato',
  ISSUE_VALUES_CHANGED: 'Campi aggiornati',
  ISSUE_DELETED: 'Segnalazione eliminata',
  ISSUE_ARCHIVED: 'Segnalazione archiviata'
};

@Component({
  selector: 'app-events',
  imports: [DatePipe, FormsModule, ButtonModule, CardModule, DatePickerModule, SelectModule, SegnalazioneDetailDialogComponent],
  template: `
    <p-card>
      <div class="page-title">
        <div>
          <h1>Eventi</h1>
          @if (projects.currentProject(); as project) {
            <p>Attività del progetto <strong>{{ project.name }}</strong></p>
          } @else {
            <p>Seleziona un progetto dall'header per vedere gli eventi.</p>
          }
        </div>
        <p-button label="Aggiorna" icon="pi pi-refresh" severity="secondary" [outlined]="true"
                  [disabled]="!projects.currentProjectId()" [loading]="loading()" (onClick)="load()" />
      </div>

      @if (projects.currentProjectId()) {
        <label>Visualizzazione
          <p-select [options]="viewOptions" [(ngModel)]="view" (ngModelChange)="applyFilters()" optionLabel="label" optionValue="value" />
        </label>
        <section class="filters" aria-label="Filtri eventi">
          <label><span>Tipo</span>
            <p-select [options]="typeOptions" [(ngModel)]="type" optionLabel="label" optionValue="value" appendTo="body" />
          </label>
          <label><span>Utente</span>
            <p-select [options]="actorOptions()" [(ngModel)]="actorId" optionLabel="label" optionValue="value" appendTo="body" />
          </label>
          <label class="date-range-filter"><span>Periodo</span>
            <p-datepicker [(ngModel)]="dateRange" selectionMode="range" dateFormat="dd/mm/yy"
                          [showIcon]="true" [showButtonBar]="true" appendTo="body"
                          placeholder="Seleziona intervallo" />
          </label>
          <p-button label="Filtra" icon="pi pi-filter" (onClick)="applyFilters()" />
          <p-button label="Pulisci" icon="pi pi-filter-slash" severity="secondary" [outlined]="true" (onClick)="clearFilters()" />
        </section>

        @if (error()) { <p class="error-message">{{ error() }}</p> }
        @if (view === 'email') {
          <div class="events-list" aria-live="polite">
            @for (batch of batches(); track batch.id) {
              <article class="email-batch">
                <h3>Batch del {{ batch.attemptedAt | date:'dd/MM/yyyy HH:mm:ss' }}</h3>
                <small>{{ batch.id }}</small>
                @for (delivery of batch.deliveries; track $index) {
                  <section class="email-delivery">
                    <strong>{{ delivery.recipientEmail || 'Indirizzo email assente' }} · {{ deliveryStatus(delivery.status) }}</strong>
                    @if (delivery.reason) { <p>{{ deliveryReason(delivery.reason) }}</p> }
                    @if (delivery.deliveryId) { <small>Email {{ delivery.deliveryId }}</small> }
                    @for (event of delivery.events; track event.id) {
                      <p>
                        @if (event.issueId && event.type !== 'ISSUE_DELETED' && event.type !== 'ISSUE_ARCHIVED') {
                          <button type="button" class="link-segnalazione" (click)="segnalazioneSelezionataId = event.issueId">#{{ event.issueId }}</button>
                        } @else { <span>#{{ event.issueId }}</span> }
                        {{ event.issueTitle }} · {{ labels[event.type] }}
                        <small>{{ event.eventDate | date:'dd/MM/yyyy HH:mm:ss' }}</small>
                      </p>
                      <p class="event-details">{{ event.data }}</p>
                    }
                  </section>
                }
              </article>
            } @empty { @if (!loading()) { <p>Nessun batch email registrato. Lo storico viene raccolto dai prossimi invii.</p> } }
          </div>
        } @else {
        <div class="events-list" aria-live="polite">
          @for (event of items(); track event.id) {
            <article class="event-row" [class.segnalazione-interna]="event.internal">
              <div class="event-icon"><i [class]="icon(event.type)" aria-hidden="true"></i></div>
              <div class="event-body">
                <strong><span class="event-actor">{{ event.actorUsername || 'Sistema' }}</span> · {{ labels[event.type] }}</strong>
                <div class="titolo-segnalazione">
                  @if (event.issueId && event.type !== 'ISSUE_DELETED') {
                    <button type="button" class="link-segnalazione" (click)="segnalazioneSelezionataId = event.issueId">#{{ event.issueId }}</button>
                  } @else if (event.issueId) {
                    <span class="riferimento-segnalazione">#{{ event.issueId }}</span>
                  }
                  @if (event.issueTitle) { <span class="event-segnalazione-titolo">{{ event.issueTitle }}</span> }
                </div>
                <p class="event-details">{{ event.data }}</p>
                <small>{{ event.eventDate | date:'dd/MM/yyyy HH:mm:ss' }}</small>
              </div>
            </article>
          } @empty {
            @if (!loading()) { <p class="empty-message">Nessun evento trovato.</p> }
          }
        </div>
        }
        @if (total() > pageSize) {
          <div class="pagination">
            <span>{{ page() * pageSize + 1 }}–{{ Math.min((page() + 1) * pageSize, total()) }} di {{ total() }}</span>
            <p-button label="Precedenti" icon="pi pi-angle-left" severity="secondary" [outlined]="true"
                      [disabled]="page() === 0" (onClick)="goToPage(page() - 1)" />
            <p-button label="Successivi" icon="pi pi-angle-right" iconPos="right" severity="secondary" [outlined]="true"
                      [disabled]="(page() + 1) * pageSize >= total()" (onClick)="goToPage(page() + 1)" />
          </div>
        }
      }
      @if (segnalazioneSelezionataId !== null) {
        <app-segnalazione-detail-dialog [issueId]="segnalazioneSelezionataId" (closed)="segnalazioneSelezionataId = null" />
      }
    </p-card>
  `,
  styleUrl: './events.component.css'
})
export class EventsComponent {
  readonly projects = inject(ProjectContextService);
  private readonly api = inject(EventsService);
  private readonly liveSync = inject(LiveSyncService);
  readonly Math = Math;
  readonly labels = labels;
  readonly pageSize = 25;
  view: 'events' | 'email' = 'email';
  readonly viewOptions = [{ label: 'Batch email', value: 'email' }, { label: 'Tutti gli eventi', value: 'events' }];
  readonly batches = signal<import('../../shared/models/event.types').EmailBatch[]>([]);
  readonly items = signal<WorkspaceEvent[]>([]);
  readonly actors = signal<EventActor[]>([]);
  readonly total = signal(0);
  readonly page = signal(0);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  segnalazioneSelezionataId: number | null = null;
  type: EventType | null = null;
  actorId: number | null = null;
  dateRange: Date[] | null = null;

  readonly typeOptions: Option<EventType | null>[] = [
    { label: 'Tutti', value: null },
    ...Object.entries(labels).map(([value, label]) => ({ label, value: value as EventType }))
  ];

  actorOptions(): Option<number | null>[] {
    return [{ label: 'Tutti', value: null }, ...this.actors().map(actor => ({ label: actor.username, value: actor.id }))];
  }

  private lastProjectId: number | null = null;
  private lastRevision = -1;
  private requestId = 0;

  constructor() {
    effect(() => {
      const projectId = this.projects.currentProjectId();
      const revision = this.liveSync.revision();
      if (projectId === this.lastProjectId && revision === this.lastRevision) return;
      const projectChanged = projectId !== this.lastProjectId;
      this.lastProjectId = projectId;
      this.lastRevision = revision;
      if (projectChanged) {
        this.items.set([]);
        this.batches.set([]);
        this.total.set(0);
        this.actors.set([]);
        this.clearFilters(false);
        if (projectId) this.api.actors(projectId).subscribe({
          next: actors => {
            if (projectId === this.projects.currentProjectId()) this.actors.set(actors);
          },
          error: () => {
            if (projectId === this.projects.currentProjectId()) this.actors.set([]);
          }
        });
      }
      if (projectId) this.load();
    });
  }

  load(): void {
    const projectId = this.projects.currentProjectId();
    if (!projectId) return;
    const requestId = ++this.requestId;
    this.loading.set(true);
    this.error.set(null);
    const from = this.dateRange?.[0] ? this.startOfDay(this.dateRange[0]).toISOString() : undefined;
    const to = this.dateRange?.[1] ? this.dayAfter(this.dateRange[1]).toISOString() : undefined;
    if (this.view === 'email') {
      this.api.batches(projectId, { page: this.page(), size: this.pageSize, type: this.type ?? undefined, actorId: this.actorId ?? undefined, from, to }).subscribe({
        next: result => {
          if (requestId !== this.requestId || projectId !== this.projects.currentProjectId()) return;
          this.batches.set(result.items); this.total.set(result.total); this.loading.set(false);
        },
        error: () => { if (requestId === this.requestId) { this.error.set('Non riesco a caricare i batch email.'); this.loading.set(false); } }
      });
      return;
    }
    this.api.list(projectId, {
      page: this.page(), size: this.pageSize, type: this.type ?? undefined,
      actorId: this.actorId ?? undefined, from, to
    }).subscribe({
      next: result => {
        if (requestId !== this.requestId || projectId !== this.projects.currentProjectId()) return;
        this.items.set(result.items);
        this.total.set(result.total);
        this.loading.set(false);
      },
      error: () => {
        if (requestId !== this.requestId) return;
        this.error.set('Non riesco a caricare gli eventi.');
        this.loading.set(false);
      }
    });
  }

  applyFilters(): void { this.page.set(0); this.load(); }
  goToPage(page: number): void { this.page.set(page); this.load(); }
  clearFilters(reload = true): void {
    this.type = null;
    this.actorId = null;
    this.dateRange = null;
    this.page.set(0);
    if (reload) this.load();
  }

  deliveryStatus(status: string): string {
    return ({ SENT: 'Inviata', SKIPPED: 'Saltata', DEFERRED: 'In attesa', FAILED: 'Invio fallito' } as Record<string, string>)[status] ?? status;
  }

  deliveryReason(reason: string): string {
    return ({ DIGEST_WINDOW_EXPIRED: 'Evento oltre la finestra temporale di invio', MIN_EVENT_AGE: 'In attesa del tempo minimo prima dell’invio', EMPTY_EMAIL: 'Indirizzo email assente',
      STATUS_RETURNED_TO_ORIGINAL: 'Lo stato è tornato al valore iniziale', COMMENTS_CANCELLED: 'I nuovi commenti sono stati annullati dalle eliminazioni', NO_RENDERABLE_CHANGES: 'Nessuna modifica rappresentabile: controllare tipo evento e dati nei log', NO_NET_CHANGES_AFTER_COLLAPSE: 'Nessuna modifica netta dopo il raggruppamento degli eventi',
      INTERNAL_NOT_VISIBLE: 'Segnalazione interna non visibile', PROJECT_NOT_VISIBLE: 'Accesso al progetto non disponibile',
      ISSUE_DELETED_OR_ARCHIVED: 'Segnalazione eliminata o archiviata', PROJECT_EMAIL_DISABLED: 'Email disattivate per il progetto',
      GLOBAL_EMAIL_DISABLED: 'Email disattivate nelle preferenze globali', ONLY_OWN_ISSUES: 'Preferenza: solo le proprie segnalazioni',
      NEW_ISSUES_DISABLED: 'Notifiche per nuove segnalazioni disattivate', COMMENTS_DISABLED: 'Notifiche per commenti disattivate',
      STATUS_CHANGES_DISABLED: 'Notifiche per passaggi di stato disattivate', ONLY_RELEASED_STATUS: 'Preferenza: solo lo stato rilasciato',
      DATA_CHANGES_DISABLED: 'Notifiche per modifiche ai dati disattivate' } as Record<string, string>)[reason] ?? reason;
  }

  icon(type: EventType): string {
    if (type === 'ISSUE_DELETED' || type === 'ISSUE_COMMENT_DELETED') return 'pi pi-trash';
    if (type === 'ISSUE_COMMENT_ADDED') return 'pi pi-comment';
    if (type === 'ISSUE_ATTACHMENT_UPLOADED') return 'pi pi-paperclip';
    if (type === 'ISSUE_CREATED') return 'pi pi-plus';
    return 'pi pi-pencil';
  }

  private startOfDay(value: Date): Date {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }

  private dayAfter(value: Date): Date {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate() + 1);
  }
}
