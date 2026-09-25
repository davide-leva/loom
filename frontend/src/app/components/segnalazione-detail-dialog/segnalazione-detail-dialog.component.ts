import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, EventEmitter, HostListener, Input, Output, effect, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { TagModule } from 'primeng/tag';
import { forkJoin } from 'rxjs';
import { AuthService } from '../../services/auth/auth.service';
import { LiveSyncService } from '../../services/live-sync/live-sync.service';
import { SegnalazioneFormComponent, SegnalazioneFormModel } from '../segnalazione-form/segnalazione-form.component';
import { JsonViewerComponent } from '../json-viewer/json-viewer.component';
import { SegnalazioniService, STATUS_LABELS, TYPE_LABELS } from '../../services/segnalazioni/segnalazioni.service';
import type { SegnalazioneAllegato, SegnalazioneCommento, SegnalazioneDettaglio, SegnalazioneCampo, SegnalazioneCampoOpzione, SegnalazioneCampoValoreInput, StatusSegnalazione, SegnalazioneSummary } from '../../services/segnalazioni/segnalazioni.service';

@Component({
  selector: 'app-segnalazione-detail-dialog',
  imports: [ButtonModule, DatePipe, DialogModule, FormsModule, JsonViewerComponent, SegnalazioneFormComponent, TagModule],
  template: `
    <p-dialog [(visible)]="visible" [modal]="true"
              [style]="{ width: '1440px', maxWidth: '98vw' }" [breakpoints]="{ '720px': '96vw' }"
              [draggable]="false" [resizable]="false" (onHide)="closed.emit()">
      <ng-template pTemplate="header">
        <div class="dialog-title">
          <span>{{ detail ? 'Segnalazione #' + detail.issue.id : 'Segnalazione' }}</span>
          @if (detail) {
            <p-tag [value]="statusLabel(detail.issue.status)" [severity]="statusSeverity(detail.issue.status)" />
          }
        </div>
      </ng-template>
      @if (loading) {
        <p>Carico dettaglio...</p>
      } @else if (detail) {
        <section class="detail-grid" [class.has-comments]="detail.comments.length > 0" data-onboarding="issue-detail">
          <div class="main-detail">
            <h2>{{ detail.issue.title }}</h2>
            <div class="auto-fields" aria-label="Campi automatici">
              <div>
                <dt>Tipologia</dt>
                <dd>{{ typeLabel(detail.issue.issueType) }}</dd>
              </div>
              <div>
                <dt>Data segnalazione</dt>
                <dd>{{ detail.issue.createdAt | date:'dd/MM/yyyy HH:mm' }}</dd>
              </div>
              <div>
                <dt>Segnalatore</dt>
                <dd>{{ detail.issue.issuerUsername || 'N/D' }}</dd>
              </div>
              <div>
                <dt>Sviluppatore</dt>
                <dd>{{ detail.issue.devUsername || 'Non assegnato' }}</dd>
              </div>
              @if (detail.issue.internal) {
                <div>
                  <dt>Visibilità</dt>
                  <dd>Solo Interna</dd>
                </div>
              }
              @if (detail.issue.releasedAt) {
                <div>
                  <dt>Rilasciata il</dt>
                  <dd>{{ detail.issue.releasedAt | date:'dd/MM/yyyy HH:mm' }}</dd>
                </div>
              }
              @if (detail.issue.approvedAt) {
                <div>
                  <dt>Approvata il</dt>
                  <dd>{{ detail.issue.approvedAt | date:'dd/MM/yyyy HH:mm' }}</dd>
                </div>
              }
            </div>
            <h3>Descrizione</h3>
            <p class="description">{{ detail.issue.description }}</p>

            @if (projectFields.length) {
              <app-segnalazione-form [model]="fieldsFormModel" [fields]="projectFields"
                                     [optionsByField]="optionsByField"
                                     [visibleScopes]="visibleFieldScopes()"
                                     [editableScopes]="editableFieldScopes()"
                                     [showStandardFields]="false"
                                     formTitle="Dati Aggiuntivi" />
            }

            <h3>Allegati</h3>
            @if (detail.attachments.length) {
              <ul class="attachments-grid">
                @for (attachment of detail.attachments; track attachment.id) {
                  <li>
                    <button type="button" class="attachment-card" (click)="openAttachment(attachment)"
                            [attr.aria-label]="(isImage(attachment) ? 'Apri anteprima di ' : 'Scarica ') + attachment.originalName">
                      <span class="attachment-thumbnail" [class.file-thumbnail]="!isImage(attachment)">
                        @if (attachmentPreviewUrl(attachment); as thumbnailUrl) {
                          <img [src]="thumbnailUrl" [alt]="''" />
                        } @else {
                          <i class="pi" [class.pi-spin]="isAttachmentLoading(attachment)"
                             [class.pi-spinner]="isAttachmentLoading(attachment)"
                             [class.pi-file]="!isAttachmentLoading(attachment)"></i>
                        }
                      </span>
                      <span class="attachment-details">
                        <strong>{{ attachment.originalName }}</strong>
                        <small>{{ fileSize(attachment.fileSize) }} · {{ attachment.uploadedAt | date:'dd/MM/yyyy HH:mm' }}</small>
                      </span>
                      <i class="pi attachment-action" [class.pi-eye]="isImage(attachment)"
                         [class.pi-download]="!isImage(attachment)"></i>
                    </button>
                  </li>
                }
              </ul>
            } @else {
              <p class="muted">Nessun allegato caricato.</p>
            }

            @if (showIssueActions()) {
              <div class="azioni-segnalazione">
                @if (canEditAnyField() && projectFields.length) {
                  <p-button label="Salva modifiche" icon="pi pi-save" [loading]="fieldsSaving"
                            [disabled]="!fieldsValid()" (onClick)="saveIssueFields()" />
                }
                @if (canApprove()) {
                  <p-button label="Approva" icon="pi pi-check" [loading]="approving" (onClick)="approve()" />
                }
                @if (canArchive()) {
                  <p-button label="Archivia" icon="pi pi-inbox" severity="secondary" [outlined]="true"
                            [loading]="archiving" (onClick)="archiviaSegnalazione()" />
                }
                @if (canDeleteIssue()) {
                  <p-button label="Elimina segnalazione" icon="pi pi-trash" severity="danger" [loading]="deleting"
                            (onClick)="eliminaSegnalazione()" />
                }
                @if (canSeeMetadata()) {
                  <p-button label="Metadati" icon="pi pi-code" severity="secondary" [outlined]="true"
                            (onClick)="metadataDialogVisible = true" />
                }
              </div>
            }
          </div>

          <aside class="comments-panel">
            <h3>Commenti</h3>
            <div class="comments-list">
              @for (comment of detail.comments; track comment.id) {
                <article class="comment-item">
                  <header>
                    <strong>{{ comment.username || 'Utente eliminato' }}</strong>
                    <span>{{ comment.date | date:'dd/MM/yyyy HH:mm' }}</span>
                  </header>
                  <p>{{ comment.comment }}</p>
                  @if (comment.canDelete) {
                    <p-button icon="pi pi-trash" ariaLabel="Elimina commento" size="small"
                              severity="danger" [text]="true" [rounded]="true"
                              (onClick)="deleteComment(comment)" />
                  }
                </article>
              } @empty {
                <p class="muted">Nessun commento.</p>
              }
            </div>
            <form class="comment-form" (ngSubmit)="addComment()" data-onboarding="issue-comments">
              <textarea name="comment" [(ngModel)]="commentDraft" rows="4" placeholder="Scrivi un commento"></textarea>
              <p-button type="submit" label="Invia" icon="pi pi-send" styleClass="w-full" [loading]="commentSaving"
                        [disabled]="!commentDraft.trim()" />
            </form>
          </aside>
        </section>
      }
      @if (error) { <p class="error-message">{{ error }}</p> }
    </p-dialog>

    <p-dialog [header]="previewAttachment?.originalName || 'Anteprima allegato'" [(visible)]="previewVisible"
      [modal]="true" [style]="{ width: '900px', maxWidth: '96vw' }"
              [breakpoints]="{ '720px': '96vw' }" [draggable]="false" [resizable]="false"
              (onHide)="closePreview()">
      <div class="preview-viewer">
        <p-button icon="pi pi-chevron-left" [rounded]="true" [outlined]="true"
                  ariaLabel="Allegato precedente" [disabled]="!canShowPrevious()"
                  (onClick)="showPrevious()" />
        <div class="image-preview">
          @if (previewLoading) {
            <i class="pi pi-spinner pi-spin preview-spinner" aria-label="Caricamento anteprima"></i>
          } @else if (previewUrl) {
            <img [src]="previewUrl" [alt]="previewAttachment?.originalName || 'Anteprima allegato'" />
          }
        </div>
        <p-button icon="pi pi-chevron-right" [rounded]="true" [outlined]="true"
                  ariaLabel="Allegato successivo" [disabled]="!canShowNext()"
                  (onClick)="showNext()" />
      </div>
      <div class="preview-actions">
        <span>{{ previewPositionLabel() }}</span>
        <p-button label="Scarica" icon="pi pi-download" [disabled]="!previewBlob"
                  (onClick)="downloadPreview()" />
      </div>
    </p-dialog>

    <p-dialog header="Metadati" [(visible)]="metadataDialogVisible" [modal]="true"
              [style]="{ width: '720px', maxWidth: '96vw' }" [breakpoints]="{ '720px': '96vw' }"
              [draggable]="false" [resizable]="false">
      @if (metadataForViewer(); as metadata) {
        <div class="metadata-viewer">
          <app-json-viewer [value]="metadata" />
        </div>
      } @else {
        <p class="muted">Nessun metadato disponibile.</p>
      }
    </p-dialog>
  `,
  styleUrl: './segnalazione-detail-dialog.component.css'
})
export class SegnalazioneDetailDialogComponent {
  private readonly segnalazioniApi = inject(SegnalazioniService);
  private readonly auth = inject(AuthService);
  private readonly events = inject(LiveSyncService);
  private lastRevision = -1;

  @Input({ required: true }) issueId!: number;
  @Output() closed = new EventEmitter<void>();
  @Output() issueChanged = new EventEmitter<SegnalazioneSummary>();
  @Output() issueDeleted = new EventEmitter<number>();

  visible = true;
  loading = false;
  approving = false;
  archiving = false;
  deleting = false;
  commentSaving = false;
  fieldsSaving = false;
  metadataDialogVisible = false;
  error = '';
  commentDraft = '';
  detail: SegnalazioneDettaglio | null = null;
  projectFields: SegnalazioneCampo[] = [];
  optionsByField = new Map<number, SegnalazioneCampoOpzione[]>();
  fieldsFormModel: SegnalazioneFormModel = { title: '', description: '', values: {}, attachments: {}, internal: false };
  previewVisible = false;
  previewLoading = false;
  previewIndex = -1;
  previewAttachment: SegnalazioneAllegato | null = null;
  previewUrl: string | null = null;
  previewBlob: Blob | null = null;
  private readonly attachmentPreviewUrls = new Map<number, string>();
  private readonly attachmentBlobs = new Map<number, Blob>();
  private readonly loadingAttachmentIds = new Set<number>();
  private loadSequence = 0;
  private destroyed = false;

  constructor() {
    effect(() => {
      const revision = this.events.revision();
      if (this.lastRevision >= 0 && revision !== this.lastRevision && this.detail) this.load(true);
      this.lastRevision = revision;
    });
  }

  ngOnInit(): void { this.load(); }

  load(refresh = false): void {
    const issueId = this.issueId;
    const sequence = ++this.loadSequence;
    if (!refresh) this.loading = true;
    this.error = '';
    this.segnalazioniApi.segnalazioneDettaglio(issueId).subscribe({
      next: detail => {
        if (sequence !== this.loadSequence || issueId !== this.issueId) return;
        this.detail = detail;
        this.syncAttachmentPreviews(detail.attachments);
        if (!refresh) {
          this.loadProjectSchema(detail.issue.projectId);
        } else {
          this.loading = false;
          this.fillFieldsForm();
        }
      },
      error: (error: unknown) => {
        if (sequence !== this.loadSequence || issueId !== this.issueId) return;
        if (refresh && error instanceof HttpErrorResponse && error.status === 404) {
          this.issueDeleted.emit(issueId);
          this.closed.emit();
          return;
        }
        this.error = 'Non riesco a caricare il dettaglio della segnalazione.';
        this.loading = false;
      }
    });
  }

  private loadProjectSchema(projectId: number): void {
    forkJoin({
      fields: this.segnalazioniApi.segnalazioneCampi(projectId),
      options: this.segnalazioniApi.segnalazioneCampoOpzioni(projectId)
    }).subscribe({
      next: ({ fields, options }) => {
        this.projectFields = [...fields]
          .filter(field => this.visibleFieldScopes().includes(field.scope))
          .sort((a, b) => a.code.localeCompare(b.code, 'it'));
        this.optionsByField = this.groupOptions(options);
        this.fillFieldsForm();
        this.loading = false;
      },
      error: () => {
        this.error = 'Non riesco a caricare i campi del progetto.';
        this.loading = false;
      }
    });
  }

  private fillFieldsForm(): void {
    const values: SegnalazioneFormModel['values'] = {};
    for (const field of this.projectFields) {
      const fieldValues = (this.detail?.values ?? [])
        .filter(value => value.definitionId === field.id)
        .sort((a, b) => a.position - b.position)
        .map(value => value.value);
      values[field.id] = field.multiple ? fieldValues : (fieldValues[0] ?? '');
    }
    this.fieldsFormModel = { title: '', description: '', values, attachments: {}, internal: false };
  }

  visibleFieldScopes(): Array<'USER' | 'SUPERUSER' | 'TEAM'> {
    const role = this.auth.user()?.role;
    if (role === 'ADMIN') return ['USER', 'TEAM', 'SUPERUSER'];
    if (role === 'TEAM') return ['USER', 'TEAM', 'SUPERUSER'];
    if (role === 'SUPERUSER') return ['USER', 'SUPERUSER'];
    return ['USER'];
  }

  editableFieldScopes(): Array<'USER' | 'SUPERUSER' | 'TEAM'> {
    const role = this.auth.user()?.role;
    if (role === 'ADMIN') return ['USER', 'TEAM', 'SUPERUSER'];
    if (role === 'TEAM') return ['USER', 'TEAM'];
    if (role === 'SUPERUSER') return ['USER', 'SUPERUSER'];
    return ['USER'];
  }

  canApprove(): boolean {
    const role = this.auth.user()?.role;
    const segnalazione = this.detail?.issue;
    if (!segnalazione || segnalazione.status !== 'RELEASED') return false;
    if (role === 'SUPERUSER') return true;
    return role === 'ADMIN' && segnalazione.internal;
  }

  canArchive(): boolean {
    const role = this.auth.user()?.role;
    const segnalazione = this.detail?.issue;
    return role === 'ADMIN' && !!segnalazione && segnalazione.status === 'APPROVED';
  }

  canEditAnyField(): boolean {
    return this.editableFieldScopes().length > 0;
  }

  showIssueActions(): boolean {
    return (this.canEditAnyField() && this.projectFields.length > 0)
      || this.canApprove() || this.canArchive() || this.canDeleteIssue();
  }

  fieldsValid(): boolean {
    const editableIds = new Set(this.projectFields
      .filter(field => this.editableFieldScopes().includes(field.scope))
      .map(field => field.id));
    return this.projectFields
      .filter(field => editableIds.has(field.id) && field.mandatory && field.type !== 'ATTACHMENTS')
      .every(field => {
        const value = this.fieldsFormModel.values[field.id];
        return Array.isArray(value) ? value.length > 0 : (value ?? '').trim().length > 0;
      });
  }

  saveIssueFields(): void {
    if (!this.detail || !this.canEditAnyField() || !this.fieldsValid() || this.fieldsSaving) return;
    this.fieldsSaving = true;
    this.error = '';
    this.segnalazioniApi.updateIssueValues(this.detail.issue.id, this.editableValues()).subscribe({
      next: detail => {
        this.detail = detail;
        this.syncAttachmentPreviews(detail.attachments);
        this.fillFieldsForm();
        this.fieldsSaving = false;
      },
      error: (response: unknown) => {
        this.fieldsSaving = false;
        this.error = this.fieldSaveErrorMessage(response);
      }
    });
  }

  private fieldSaveErrorMessage(response: unknown): string {
    if (response instanceof HttpErrorResponse) {
      const backendMessage = typeof response.error?.message === 'string'
        ? response.error.message
        : typeof response.error === 'string' ? response.error : '';
      if (backendMessage) return `Salvataggio non riuscito: ${backendMessage}`;
      if (response.status === 400) return 'Salvataggio non riuscito: alcuni campi non sono validi.';
      if (response.status === 403) return 'Salvataggio non riuscito: non hai i permessi per modificare questi campi.';
      if (response.status === 404) return 'Salvataggio non riuscito: segnalazione non trovata.';
      if (response.status === 410) return 'Salvataggio non riuscito: la segnalazione è stata archiviata o eliminata.';
      if (response.status === 0) return 'Salvataggio non riuscito: errore di rete.';
    }
    return 'Non riesco a salvare i campi della segnalazione.';
  }

  approve(): void {
    if (!this.detail || this.approving) return;
    this.approving = true;
    this.segnalazioniApi.approvaSegnalazione(this.detail.issue.id).subscribe({
      next: segnalazione => {
        this.detail = { ...this.detail!, issue: segnalazione };
        this.issueChanged.emit(segnalazione);
        this.approving = false;
      },
      error: () => { this.error = 'Non riesco ad approvare la segnalazione.'; this.approving = false; }
    });
  }

  archiviaSegnalazione(): void {
    if (!this.detail || this.archiving) return;
    this.archiving = true;
    this.segnalazioniApi.archiviaSegnalazione(this.detail.issue.id).subscribe({
      next: segnalazione => {
        this.detail = { ...this.detail!, issue: segnalazione };
        this.issueChanged.emit(segnalazione);
        this.archiving = false;
      },
      error: () => { this.error = 'Non riesco ad archiviare la segnalazione.'; this.archiving = false; }
    });
  }

  canDeleteIssue(): boolean {
    const segnalazione = this.detail?.issue;
    const user = this.auth.user();
    if (!segnalazione || !user) return false;
    if (user.role === 'ADMIN') return true;
    const created = new Date(segnalazione.createdAt).getTime();
    return segnalazione.issuerUserId === user.id && Date.now() - created <= 10 * 60 * 1000;
  }

  canSeeMetadata(): boolean {
    const role = this.auth.user()?.role;
    if (role !== 'ADMIN' && role !== 'TEAM') return false;
    const metadata = this.detail?.issue.metadata;
    return metadata !== null && metadata !== undefined && Object.keys(metadata).length > 0;
  }

  /** Returns the issue's metadata when it is a non-empty object, otherwise null.
   *  Used by the metadata dialog so the template can pass a non-null value to
   *  <app-json-viewer> while keeping strict-null template type checking happy. */
  metadataForViewer(): Record<string, unknown> | null {
    const metadata = this.detail?.issue.metadata;
    if (metadata == null) return null;
    if (Object.keys(metadata).length === 0) return null;
    return metadata;
  }

  eliminaSegnalazione(): void {
    if (!this.detail || !this.canDeleteIssue() || this.deleting) return;
    const issueId = this.detail.issue.id;
    this.deleting = true;
    this.segnalazioniApi.eliminaSegnalazione(issueId).subscribe({
      next: () => {
        this.deleting = false;
        this.issueDeleted.emit(issueId);
        this.visible = false;
        this.closed.emit();
      },
      error: () => { this.error = 'Non riesco a eliminare la segnalazione.'; this.deleting = false; }
    });
  }

  addComment(): void {
    if (!this.detail || !this.commentDraft.trim() || this.commentSaving) return;
    this.commentSaving = true;
    this.segnalazioniApi.addComment(this.detail.issue.id, this.commentDraft.trim()).subscribe({
      next: comment => {
        this.detail = { ...this.detail!, comments: [...this.detail!.comments, comment] };
        this.commentDraft = '';
        this.commentSaving = false;
      },
      error: () => { this.error = 'Non riesco a salvare il commento.'; this.commentSaving = false; }
    });
  }

  deleteComment(comment: SegnalazioneCommento): void {
    if (!this.detail) return;
    this.segnalazioniApi.deleteComment(comment.id).subscribe({
      next: () => this.detail = { ...this.detail!, comments: this.detail!.comments.filter(item => item.id !== comment.id) },
      error: () => this.error = 'Non riesco a eliminare il commento.'
    });
  }

  openAttachment(attachment: SegnalazioneAllegato): void {
    if (!this.isImage(attachment)) {
      this.download(attachment);
      return;
    }

    this.previewAttachment = attachment;
    this.previewIndex = this.imageAttachments().findIndex(item => item.id === attachment.id);
    this.previewUrl = this.attachmentPreviewUrls.get(attachment.id) ?? null;
    this.previewBlob = this.attachmentBlobs.get(attachment.id) ?? null;
    this.previewLoading = !this.previewUrl;
    this.previewVisible = true;
    this.loadAttachmentPreview(attachment);
  }

  downloadPreview(): void {
    if (!this.previewBlob || !this.previewAttachment) return;
    this.saveBlob(this.previewBlob, this.previewAttachment.originalName);
  }

  closePreview(): void {
    this.previewVisible = false;
    this.previewLoading = false;
    this.previewIndex = -1;
    this.previewAttachment = null;
    this.previewBlob = null;
    this.previewUrl = null;
  }

  imageAttachments(): SegnalazioneAllegato[] {
    return (this.detail?.attachments ?? []).filter(attachment => this.isImage(attachment));
  }

  attachmentPreviewUrl(attachment: SegnalazioneAllegato): string | null {
    return this.attachmentPreviewUrls.get(attachment.id) ?? null;
  }

  isAttachmentLoading(attachment: SegnalazioneAllegato): boolean {
    return this.isImage(attachment) && this.loadingAttachmentIds.has(attachment.id);
  }

  canShowPrevious(): boolean {
    return this.previewIndex > 0;
  }

  canShowNext(): boolean {
    return this.previewIndex >= 0 && this.previewIndex < this.imageAttachments().length - 1;
  }

  showPrevious(): void {
    if (!this.canShowPrevious()) return;
    this.openAttachment(this.imageAttachments()[this.previewIndex - 1]);
  }

  showNext(): void {
    if (!this.canShowNext()) return;
    this.openAttachment(this.imageAttachments()[this.previewIndex + 1]);
  }

  previewPositionLabel(): string {
    const total = this.imageAttachments().length;
    return this.previewIndex >= 0 ? `${this.previewIndex + 1} di ${total}` : '';
  }

  @HostListener('window:keydown', ['$event'])
  navigatePreviewWithKeyboard(event: KeyboardEvent): void {
    if (!this.previewVisible) return;
    if (event.key === 'ArrowLeft' && this.canShowPrevious()) {
      event.preventDefault();
      this.showPrevious();
    } else if (event.key === 'ArrowRight' && this.canShowNext()) {
      event.preventDefault();
      this.showNext();
    }
  }

  download(attachment: SegnalazioneAllegato): void {
    this.segnalazioniApi.downloadAttachment(attachment.id).subscribe({
      next: blob => this.saveBlob(blob, attachment.originalName),
      error: () => this.error = 'Non riesco a scaricare l’allegato.'
    });
  }

  isImage(attachment: SegnalazioneAllegato): boolean {
    return (attachment.contentType ?? '').startsWith('image/');
  }

  private saveBlob(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
  }

  private syncAttachmentPreviews(attachments: SegnalazioneAllegato[]): void {
    const activeIds = new Set(attachments.map(attachment => attachment.id));
    if (this.previewAttachment && !activeIds.has(this.previewAttachment.id)) this.closePreview();
    for (const [attachmentId, url] of this.attachmentPreviewUrls) {
      if (activeIds.has(attachmentId)) continue;
      URL.revokeObjectURL(url);
      this.attachmentPreviewUrls.delete(attachmentId);
      this.attachmentBlobs.delete(attachmentId);
    }
    for (const attachment of attachments.filter(item => this.isImage(item))) {
      this.loadAttachmentPreview(attachment);
    }
  }

  private loadAttachmentPreview(attachment: SegnalazioneAllegato): void {
    if (this.attachmentPreviewUrls.has(attachment.id) || this.loadingAttachmentIds.has(attachment.id)) return;
    this.loadingAttachmentIds.add(attachment.id);
    this.segnalazioniApi.downloadAttachment(attachment.id).subscribe({
      next: blob => {
        this.loadingAttachmentIds.delete(attachment.id);
        if (this.destroyed || !this.detail?.attachments.some(item => item.id === attachment.id)) return;
        const url = URL.createObjectURL(blob);
        this.attachmentBlobs.set(attachment.id, blob);
        this.attachmentPreviewUrls.set(attachment.id, url);
        if (this.previewAttachment?.id === attachment.id) {
          this.previewBlob = blob;
          this.previewUrl = url;
          this.previewLoading = false;
        }
      },
      error: () => {
        this.loadingAttachmentIds.delete(attachment.id);
        if (this.destroyed) return;
        if (this.previewAttachment?.id === attachment.id) {
          this.previewLoading = false;
          this.error = 'Non riesco ad aprire l’anteprima allegato.';
        }
      }
    });
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.loadSequence++;
    for (const url of this.attachmentPreviewUrls.values()) URL.revokeObjectURL(url);
    this.attachmentPreviewUrls.clear();
    this.attachmentBlobs.clear();
  }

  private editableValues(): SegnalazioneCampoValoreInput[] {
    const editableScopes = new Set(this.editableFieldScopes());
    return this.projectFields
      .filter(field => editableScopes.has(field.scope) && field.type !== 'ATTACHMENTS')
      .flatMap(field => {
        const rawValue = this.fieldsFormModel.values[field.id];
        const values = Array.isArray(rawValue) ? rawValue : [rawValue];
        return values
          .map(value => (value ?? '').trim())
          .filter(value => value.length > 0)
          .map((value, position) => ({ definitionId: field.id, position, value }));
      });
  }

  private groupOptions(options: SegnalazioneCampoOpzione[]): Map<number, SegnalazioneCampoOpzione[]> {
    const output = new Map<number, SegnalazioneCampoOpzione[]>();
    for (const option of options.filter(item => item.active)) {
      output.set(option.definitionId, [...(output.get(option.definitionId) ?? []), option]);
    }
    for (const [fieldId, fieldOptions] of output.entries()) {
      output.set(fieldId, fieldOptions.sort((a, b) => a.label.localeCompare(b.label, 'it')));
    }
    return output;
  }

  fileSize(bytes: number): string {
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(bytes >= 10 * 1024 ? 0 : 1)} KB`;
    return `${bytes} B`;
  }
  statusLabel(status: StatusSegnalazione): string { return STATUS_LABELS[status]; }
  typeLabel(type: SegnalazioneSummary['issueType']): string { return type === null ? 'Non categorizzata' : TYPE_LABELS[type]; }
  statusSeverity(status: StatusSegnalazione): 'secondary' | 'info' | 'warn' | 'success' | 'contrast' {
    return ({ REPORTED: 'info', IN_PROGRESS: 'warn', COMPLETED: 'success', RELEASED: 'secondary', APPROVED: 'contrast' })[status] as 'secondary' | 'info' | 'warn' | 'success' | 'contrast';
  }
}
