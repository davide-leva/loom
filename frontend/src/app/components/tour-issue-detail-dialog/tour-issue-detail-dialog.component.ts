import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Output } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { TagModule } from 'primeng/tag';

/**
 * Tour fallback dialog. Mirrors the layout of {@link SegnalazioneDetailDialogComponent}
 * with hard-coded mock data so the guided tour can showcase the detail view
 * even on a project that has no real segnalazioni yet.
 *
 * Intentionally read-only: no save / approve / archive / delete buttons.
 * The dialog itself emits `closed` so the host page can clean up state
 * when the tour moves on or is skipped.
 */
@Component({
  selector: 'app-tour-issue-detail-dialog',
  imports: [CommonModule, ButtonModule, DialogModule, TagModule],
  template: `
    <p-dialog [(visible)]="visible" [modal]="true"
              [style]="{ width: '1440px', maxWidth: '98vw' }" [breakpoints]="{ '720px': '96vw' }"
              [draggable]="false" [resizable]="false" (onHide)="closed.emit()">
      <ng-template pTemplate="header">
        <div class="dialog-title">
          <span>Segnalazione #42</span>
          <p-tag value="In lavorazione" severity="warn" />
        </div>
      </ng-template>
      <section class="detail-grid has-comments" data-onboarding="issue-detail">
        <div class="main-detail">
          <h2>Login fallito durante l'autenticazione SSO</h2>
          <div class="auto-fields" aria-label="Campi automatici">
            <div>
              <dt>Tipologia</dt>
              <dd>Anomalia</dd>
            </div>
            <div>
              <dt>Data segnalazione</dt>
              <dd>15/03/2026 09:42</dd>
            </div>
            <div>
              <dt>Segnalatore</dt>
              <dd>marco.rossi</dd>
            </div>
            <div>
              <dt>Sviluppatore</dt>
              <dd>giulia.bianchi</dd>
            </div>
          </div>

          <h3>Descrizione</h3>
          <p class="description">
            Diversi utenti segnalano che il login SSO con Okta termina con un errore
            generico dopo il redirect al portale. Il problema si presenta in modo
            intermittente dal rilascio di martedì sera. Servono indicazioni sulla
            finestra di manutenzione e sui client coinvolti.
          </p>

          <h3>Allegati</h3>
          <p class="muted">Nessun allegato caricato.</p>

          <p class="tour-banner">
            <i class="pi pi-info-circle"></i>
            Questo è un esempio di segnalazione usato dal tour guidato. Le tue
            segnalazioni reali avranno titolo, descrizione e dati di progetto qui.
          </p>
        </div>

        <aside class="comments-panel">
          <h3>Commenti</h3>
          <div class="comments-list">
            <article class="comment-item">
              <header>
                <strong>giulia.bianchi</strong>
                <span>15/03/2026 10:05</span>
              </header>
              <p>Ho aperto un'analisi lato log: sembra legato al cambio di rotazione dei certificati SAML.</p>
            </article>
            <article class="comment-item">
              <header>
                <strong>marco.rossi</strong>
                <span>15/03/2026 10:11</span>
              </header>
              <p>Grazie. Confermo che dopo l'ultimo riavvio del servizio auth il problema persiste per alcuni tenant.</p>
            </article>
          </div>
          <form class="comment-form" (ngSubmit)="onFakeSubmit($event)" data-onboarding="issue-comments">
            <textarea name="comment" rows="4" placeholder="Scrivi un commento"></textarea>
            <p-button type="submit" label="Invia" icon="pi pi-send" styleClass="w-full" />
          </form>
        </aside>
      </section>
    </p-dialog>
  `,
  styleUrl: '../segnalazione-detail-dialog/segnalazione-detail-dialog.component.css'
})
export class TourIssueDetailDialogComponent {
  @Output() closed = new EventEmitter<void>();

  visible = true;

  onFakeSubmit(event: Event): void {
    // The tour is non-destructive — prevent the form from doing anything
    // when the user presses the (visible-but-inert) "Invia" button.
    event.preventDefault();
  }
}
