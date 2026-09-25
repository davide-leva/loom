export type TourRole = 'USER' | 'SUPERUSER';

export type TourDialogKind = 'create' | 'detail';

export interface TourStep {
  /** Stable id, used in tests and analytics. */
  id: string;
  /** Route to navigate to when this step is reached. */
  route: string;
  /** CSS selector for the element to highlight. */
  target: string;
  /** Short headline shown at the top of the tooltip. */
  title: string;
  /** Body copy describing what the target does. */
  text: string;
  /** Preferred tooltip placement relative to the target. */
  placement?: 'top' | 'bottom' | 'left' | 'right';
  /** Roles that should see this step. Omit to show to every role. */
  roles?: TourRole[];
  /**
   * If set, the host page will open the matching dialog when this step is
   * reached. The cutout then targets an element INSIDE the dialog so the
   * tour stays accurate even when the page itself didn't navigate.
   */
  openDialog?: TourDialogKind;
}

/**
 * Ordered list of tour steps. Steps with `roles` are filtered out at runtime
 * for users whose role is not in the list. To add or reorder steps, edit this
 * array — the rest of the tour machinery picks them up automatically.
 */
export const TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    route: '/dashboard',
    target: '[data-onboarding="brand"]',
    title: 'Benvenuto in Loom',
    text: 'Ti guido alla scoperta delle funzionalita principali. Usa Avanti per procedere, Salta per chiudere il tour in qualsiasi momento.'
  },
  {
    id: 'project-picker',
    route: '/dashboard',
    target: '[data-onboarding="project-picker"]',
    title: 'Scegli il progetto',
    text: 'Qui cambi il progetto di lavoro. Tutte le viste, i filtri e il report PDF seguono il progetto selezionato.'
  },
  {
    id: 'dashboard-filters',
    route: '/dashboard',
    target: '[data-onboarding="dashboard-filters"]',
    title: 'Filtri dashboard',
    text: 'La barra filtri cerca per testo libero, stato, tipologia, segnalatore e periodo. Pulisci per ripartire da zero.'
  },
  {
    id: 'issue-detail',
    route: '/dashboard',
    openDialog: 'detail',
    target: '[data-onboarding="issue-detail"]',
    title: 'Dettaglio segnalazione',
    text: 'Aprendo una segnalazione vedi titolo, descrizione, campi personalizzati del progetto e gli allegati. Clicca su una riga della dashboard per aprire questo pannello.'
  },
  {
    id: 'issue-comments',
    route: '/dashboard',
    openDialog: 'detail',
    target: '[data-onboarding="issue-comments"]',
    title: 'Commenti',
    text: 'Da qui puoi aggiungere un commento per dialogare con il team. Chi ha i permessi puo anche approvare, archiviare o eliminare la segnalazione.'
  },
  {
    id: 'dashboard-new-issue',
    route: '/dashboard',
    target: '[data-onboarding="dashboard-new-issue"]',
    title: 'Nuova segnalazione',
    text: 'Da qui apri il dialog per creare una nuova segnalazione.'
  },
  {
    id: 'new-issue-form',
    route: '/dashboard',
    openDialog: 'create',
    target: '[data-onboarding="new-issue-form"]',
    title: 'Form nuova segnalazione',
    text: 'Qui inserisci titolo, descrizione, eventuali allegati e i campi personalizzati del progetto. Il tour non salva nulla: usa Annulla per chiudere senza creare.'
  },
  {
    id: 'dashboard-pdf-report',
    route: '/dashboard',
    target: '[data-onboarding="dashboard-pdf-report"]',
    title: 'Report PDF',
    text: 'Esporta un PDF con le segnalazioni del progetto, rispettando i filtri attivi in questo momento.'
  },
  {
    id: 'dashboard-archived',
    route: '/dashboard',
    target: '[data-onboarding="dashboard-archived"]',
    title: 'Segnalazioni archiviate',
    text: 'Le segnalazioni archiviate non compaiono nelle viste principali ma restano consultabili: il badge mostra quante ne hai.'
  },
  {
    id: 'archived-page',
    route: '/archivio',
    target: '[data-onboarding="archived-table"]',
    title: 'Pagina archivio',
    text: 'Qui trovi tutte le segnalazioni archiviate del progetto con la data di archiviazione. Filtri e ordinamento funzionano come in dashboard.'
  },
  {
    id: 'anomalies-board',
    route: '/anomalie',
    target: '[data-onboarding="board-columns"]',
    title: 'Kanban Anomalie',
    text: 'Ogni colonna rappresenta uno stato: Segnalato, In lavorazione, Completato, Rilasciato, Approvato. Clicca una card per aprire il dettaglio della segnalazione.'
  },
  {
    id: 'approve-column',
    route: '/anomalie',
    target: '[data-onboarding="board-approved-column"]',
    title: 'Colonna Approvato',
    text: 'Solo un SUPERUSER (o un ADMIN per le segnalazioni interne) puo approvare una segnalazione, e solo dopo che e Rilasciata. L\'azione Approva e disponibile nel pannello di dettaglio.',
    roles: ['SUPERUSER']
  },
  {
    id: 'other-kanban',
    route: '/migliorie',
    target: '[data-onboarding="board-filters"]',
    title: 'Migliorie e Implementazioni',
    text: 'Le kanban Migliorie e Implementazioni funzionano esattamente come Anomalie: stessi filtri, stesse colonne, stesse regole di stato.'
  },
  {
    id: 'done',
    route: '/dashboard',
    target: '[data-onboarding="user-menu"]',
    title: 'Tour completato',
    text: 'Da ora saprai dove trovare ogni funzione. Se ti serve ripassare, contatta un amministratore per resettare il flag del tour.'
  }
];
