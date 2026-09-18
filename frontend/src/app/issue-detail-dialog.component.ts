import { DatePipe } from '@angular/common';
import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { TagModule } from 'primeng/tag';
import { AuthService } from './auth.service';
import {
  IssueAttachment,
  IssueComment,
  IssueDetail,
  IssueStatus,
  IssueSummary,
  IssuesService,
  STATUS_LABELS,
  TYPE_LABELS
} from './issues.service';

@Component({
  selector: 'app-issue-detail-dialog',
  imports: [ButtonModule, DatePipe, DialogModule, FormsModule, TagModule],
  template: `
    <p-dialog [header]="detail ? 'Issue #' + detail.issue.id : 'Issue'" [(visible)]="visible" [modal]="true"
              [style]="{ width: '1440px', maxWidth: '98vw' }" [breakpoints]="{ '720px': '96vw' }"
              [draggable]="false" [resizable]="false" (onHide)="closed.emit()">
      @if (loading) {
        <p>Carico dettaglio...</p>
      } @else if (detail) {
        <section class="detail-grid" [class.has-comments]="detail.comments.length > 0">
          <div class="main-detail">
            <h2>{{ detail.issue.title }}</h2>
            <div class="meta-row">
              <p-tag [value]="statusLabel(detail.issue.status)" [severity]="statusSeverity(detail.issue.status)" />
              <span>{{ typeLabel(detail.issue.issueType) }}</span>
              <span>{{ detail.issue.createdAt | date:'dd/MM/yyyy HH:mm' }}</span>
              <span>Segnalatore: {{ detail.issue.issuerUsername || 'N/D' }}</span>
              <span>Sviluppatore: {{ detail.issue.devUsername || 'Non assegnato' }}</span>
            </div>
            <h3>Descrizione</h3>
            <p class="description">{{ detail.issue.description }}</p>

            <h3>Campi</h3>
            @if (detail.values.length) {
              <dl class="values-list">
                @for (value of detail.values; track value.id) {
                  <div>
                    <dt>{{ value.label }}</dt>
                    <dd>{{ value.value }}</dd>
                  </div>
                }
              </dl>
            } @else {
              <p class="muted">Nessun campo custom valorizzato.</p>
            }

            <h3>Allegati</h3>
            @if (detail.attachments.length) {
              <ul class="attachments-list">
                @for (attachment of detail.attachments; track attachment.id) {
                  <li>
                    <button type="button" (click)="openAttachment(attachment)">{{ attachment.originalName }}</button>
                    <span>{{ fileSize(attachment.fileSize) }} · {{ attachment.uploadedAt | date:'dd/MM/yyyy HH:mm' }}</span>
                  </li>
                }
              </ul>
            } @else {
              <p class="muted">Nessun allegato caricato.</p>
            }

            @if (canApprove()) {
              <div class="approval-box">
                <p>La issue è rilasciata. Puoi approvarla.</p>
                <p-button label="Approva" icon="pi pi-check" [loading]="approving" (onClick)="approve()" />
              </div>
            }
            @if (canDeleteIssue()) {
              <div class="delete-box">
                <p>Puoi eliminare questa issue.</p>
                <p-button label="Elimina issue" icon="pi pi-trash" severity="danger" [loading]="deleting"
                          (onClick)="deleteIssue()" />
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
                    <p-button label="Elimina" size="small" severity="danger" [text]="true"
                              (onClick)="deleteComment(comment)" />
                  }
                </article>
              } @empty {
                <p class="muted">Nessun commento.</p>
              }
            </div>
            <form class="comment-form" (ngSubmit)="addComment()">
              <textarea name="comment" [(ngModel)]="commentDraft" rows="4" placeholder="Scrivi un commento"></textarea>
              <p-button type="submit" label="Invia" icon="pi pi-send" [loading]="commentSaving"
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
      @if (previewUrl) {
        <div class="image-preview">
          <img [src]="previewUrl" [alt]="previewAttachment?.originalName || 'Anteprima allegato'" />
        </div>
        <div class="preview-actions">
          <p-button label="Scarica" icon="pi pi-download" (onClick)="downloadPreview()" />
        </div>
      }
    </p-dialog>
  `,
  styleUrl: './issue-detail-dialog.component.css'
})
export class IssueDetailDialogComponent {
  private readonly issuesApi = inject(IssuesService);
  private readonly auth = inject(AuthService);

  @Input({ required: true }) issueId!: number;
  @Output() closed = new EventEmitter<void>();
  @Output() issueChanged = new EventEmitter<IssueSummary>();
  @Output() issueDeleted = new EventEmitter<number>();

  visible = true;
  loading = false;
  approving = false;
  deleting = false;
  commentSaving = false;
  error = '';
  commentDraft = '';
  detail: IssueDetail | null = null;
  previewVisible = false;
  previewAttachment: IssueAttachment | null = null;
  previewUrl: string | null = null;
  private previewBlob: Blob | null = null;

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading = true;
    this.error = '';
    this.issuesApi.issueDetail(this.issueId).subscribe({
      next: detail => { this.detail = detail; this.loading = false; },
      error: () => { this.error = 'Non riesco a caricare il dettaglio issue.'; this.loading = false; }
    });
  }

  canApprove(): boolean {
    return this.auth.user()?.role === 'SUPERUSER' && this.detail?.issue.status === 'RELEASED';
  }

  approve(): void {
    if (!this.detail || this.approving) return;
    this.approving = true;
    this.issuesApi.approveIssue(this.detail.issue.id).subscribe({
      next: issue => {
        this.detail = { ...this.detail!, issue };
        this.issueChanged.emit(issue);
        this.approving = false;
      },
      error: () => { this.error = 'Non riesco ad approvare la issue.'; this.approving = false; }
    });
  }

  canDeleteIssue(): boolean {
    const issue = this.detail?.issue;
    const user = this.auth.user();
    if (!issue || !user) return false;
    if (user.role === 'ADMIN') return true;
    const created = new Date(issue.createdAt).getTime();
    return issue.issuerUserId === user.id && Date.now() - created <= 10 * 60 * 1000;
  }

  deleteIssue(): void {
    if (!this.detail || !this.canDeleteIssue() || this.deleting) return;
    const issueId = this.detail.issue.id;
    this.deleting = true;
    this.issuesApi.deleteIssue(issueId).subscribe({
      next: () => {
        this.deleting = false;
        this.issueDeleted.emit(issueId);
        this.visible = false;
        this.closed.emit();
      },
      error: () => { this.error = 'Non riesco a eliminare la issue.'; this.deleting = false; }
    });
  }

  addComment(): void {
    if (!this.detail || !this.commentDraft.trim() || this.commentSaving) return;
    this.commentSaving = true;
    this.issuesApi.addComment(this.detail.issue.id, this.commentDraft.trim()).subscribe({
      next: comment => {
        this.detail = { ...this.detail!, comments: [...this.detail!.comments, comment] };
        this.commentDraft = '';
        this.commentSaving = false;
      },
      error: () => { this.error = 'Non riesco a salvare il commento.'; this.commentSaving = false; }
    });
  }

  deleteComment(comment: IssueComment): void {
    if (!this.detail) return;
    this.issuesApi.deleteComment(comment.id).subscribe({
      next: () => this.detail = { ...this.detail!, comments: this.detail!.comments.filter(item => item.id !== comment.id) },
      error: () => this.error = 'Non riesco a eliminare il commento.'
    });
  }

  openAttachment(attachment: IssueAttachment): void {
    if (!this.isImage(attachment)) {
      this.download(attachment);
      return;
    }
    this.issuesApi.downloadAttachment(attachment.id).subscribe({
      next: blob => {
        this.revokePreviewUrl();
        this.previewBlob = blob;
        this.previewAttachment = attachment;
        this.previewUrl = URL.createObjectURL(blob);
        this.previewVisible = true;
      },
      error: () => this.error = 'Non riesco ad aprire l’anteprima allegato.'
    });
  }

  downloadPreview(): void {
    if (!this.previewBlob || !this.previewAttachment) return;
    this.saveBlob(this.previewBlob, this.previewAttachment.originalName);
  }

  closePreview(): void {
    this.previewVisible = false;
    this.previewAttachment = null;
    this.previewBlob = null;
    this.revokePreviewUrl();
  }

  download(attachment: IssueAttachment): void {
    this.issuesApi.downloadAttachment(attachment.id).subscribe({
      next: blob => this.saveBlob(blob, attachment.originalName),
      error: () => this.error = 'Non riesco a scaricare l’allegato.'
    });
  }

  isImage(attachment: IssueAttachment): boolean {
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

  private revokePreviewUrl(): void {
    if (this.previewUrl) URL.revokeObjectURL(this.previewUrl);
    this.previewUrl = null;
  }

  fileSize(bytes: number): string {
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(bytes >= 10 * 1024 ? 0 : 1)} KB`;
    return `${bytes} B`;
  }
  statusLabel(status: IssueStatus): string { return STATUS_LABELS[status]; }
  typeLabel(type: IssueSummary['issueType']): string { return type === null ? 'Non categorizzata' : TYPE_LABELS[type]; }
  statusSeverity(status: IssueStatus): 'secondary' | 'info' | 'warn' | 'success' | 'contrast' {
    return ({ REPORTED: 'info', IN_PROGRESS: 'warn', COMPLETED: 'success', RELEASED: 'secondary', APPROVED: 'contrast' })[status] as 'secondary' | 'info' | 'warn' | 'success' | 'contrast';
  }
}
