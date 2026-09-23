import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { forkJoin, of } from 'rxjs';
import { AuthService } from '../../services/auth/auth.service';
import { SegnalazioneFormComponent, SegnalazioneFormModel } from '../segnalazione-form/segnalazione-form.component';
import { SegnalazioniService } from '../../services/segnalazioni/segnalazioni.service';
import type { SegnalazioneCampo, SegnalazioneCampoOpzione, SegnalazioneCampoValoreInput, SegnalazioneSummary, FieldScope, ProjectUserSummary } from '../../services/segnalazioni/segnalazioni.service';

@Component({
  selector: 'app-segnalazione-create-dialog',
  imports: [ButtonModule, DialogModule, FormsModule, SegnalazioneFormComponent],
  template: `
    <p-dialog header="Nuova segnalazione" [(visible)]="visible" [modal]="true"
              [style]="{ width: '860px', maxWidth: '96vw' }" [breakpoints]="{ '720px': '96vw' }"
              [draggable]="false" [resizable]="false" (onHide)="closed.emit()">
      <form class="dialog-form" #issueForm="ngForm" (ngSubmit)="save()">

        @if (schemaLoading) {
          <p class="loading-message">Carico campi del progetto...</p>
        } @else {
          <app-segnalazione-form [model]="formModel" [fields]="fields" [optionsByField]="optionsByField"
                          [visibleScopes]="visibleScopes()" [showInternalControl]="isInternalUser()" />
        }

        @if (error) {
          <p class="error-message">{{ error }}</p>
        }

        <div class="dialog-actions">
          <p-button type="button" label="Annulla" severity="secondary" [outlined]="true"
                    [disabled]="saving" (onClick)="close()" />
          <p-button type="submit" label="Crea segnalazione" icon="pi pi-plus" [loading]="saving"
                    [disabled]="issueForm.invalid || schemaLoading || !canSave()" />
        </div>
      </form>
    </p-dialog>
  `,
  styles: [`
    .dialog-form { display: grid; gap: 16px; padding-top: 6px; }
    .meta-field { display: flex; flex-direction: column; gap: 7px; color: #64748b; font-size: 13px; font-weight: 700; }
    .meta-field small { font-weight: 500; color: #94a3b8; }
    .dialog-actions { display: flex; justify-content: flex-end; gap: 10px; }
    .error-message { margin: 0; color: #b91c1c; font-weight: 700; }
    .loading-message { margin: 0; color: #64748b; }
    :host ::ng-deep .p-select { width: 100%; }
  `]
})
export class SegnalazioneCreateDialogComponent {
  private readonly segnalazioniApi = inject(SegnalazioniService);
  private readonly auth = inject(AuthService);

  @Input({ required: true }) projectId: number | null = null;
  @Input() users: ProjectUserSummary[] = [];
  @Output() created = new EventEmitter<SegnalazioneSummary>();
  @Output() closed = new EventEmitter<void>();

  visible = true;
  saving = false;
  schemaLoading = false;
  error = '';
  fields: SegnalazioneCampo[] = [];
  optionsByField = new Map<number, SegnalazioneCampoOpzione[]>();
  formModel: SegnalazioneFormModel = { title: '', description: '', values: {}, attachments: {}, internal: false };


  private loadedProjectId: number | null = null;

  ngOnChanges(): void {
    if (this.projectId !== null && this.projectId !== this.loadedProjectId) this.loadSchema(this.projectId);
  }

  canSave(): boolean {
    return this.projectId !== null
      && this.formModel.title.trim().length > 0
      && this.formModel.description.trim().length > 0
      && this.mandatoryFieldsFilled();
  }

  save(): void {
    if (!this.canSave() || this.projectId === null || this.saving) return;
    this.saving = true;
    this.error = '';
    this.segnalazioniApi.creaSegnalazione({
      projectId: this.projectId,
      title: this.formModel.title.trim(),
      description: this.formModel.description.trim(),
      values: this.customValues(),
      internal: this.isInternalUser() && this.formModel.internal
    }).subscribe({
      next: segnalazione => this.uploadAttachments(segnalazione),
      error: () => {
        this.saving = false;
        this.error = 'Non riesco a creare la segnalazione.';
      }
    });
  }

  close(): void {
    this.visible = false;
    this.closed.emit();
  }

  private uploadAttachments(segnalazione: SegnalazioneSummary): void {
    const uploads = Object.entries(this.formModel.attachments)
      .flatMap(([fieldId, files]) => files.map(file => this.segnalazioniApi.uploadAttachment(segnalazione.id, Number(fieldId), file)));
    if (uploads.length === 0) {
      this.saving = false;
      this.created.emit(segnalazione);
      this.close();
      return;
    }
    forkJoin(uploads.length ? uploads : [of(null)]).subscribe({
      next: () => {
        this.saving = false;
        this.created.emit(segnalazione);
        this.close();
      },
      error: () => {
        this.saving = false;
        this.error = 'Segnalazione creata, ma non riesco a caricare uno o più allegati.';
        this.created.emit(segnalazione);
      }
    });
  }

  private loadSchema(projectId: number): void {
    this.loadedProjectId = projectId;
    this.schemaLoading = true;
    this.error = '';
    forkJoin({
      fields: this.segnalazioniApi.segnalazioneCampi(projectId),
      options: this.segnalazioniApi.segnalazioneCampoOpzioni(projectId)
    }).subscribe({
      next: ({ fields, options }) => {
        if (this.projectId !== projectId) return;
        this.fields = this.sortFields(fields);
        this.optionsByField = this.groupOptions(options);
        this.formModel.internal = this.isInternalUser();
        this.schemaLoading = false;
      },
      error: () => {
        if (this.projectId !== projectId) return;
        this.error = 'Non riesco a caricare i campi del form.';
        this.schemaLoading = false;
      }
    });
  }

  private mandatoryFieldsFilled(): boolean {
    return this.fields
      .filter(field => this.visibleScopes().includes(field.scope) && field.mandatory && field.type !== 'ATTACHMENTS')
      .every(field => {
        const value = this.formModel.values[field.id];
        return Array.isArray(value) ? value.length > 0 : (value ?? '').trim().length > 0;
      });
  }

  private customValues(): SegnalazioneCampoValoreInput[] {
    return this.fields
      .filter(field => this.visibleScopes().includes(field.scope) && field.type !== 'ATTACHMENTS')
      .flatMap(field => {
        const rawValue = this.formModel.values[field.id];
        const values = Array.isArray(rawValue) ? rawValue : [rawValue];
        return values
          .map(value => (value ?? '').trim())
          .filter(value => value.length > 0)
          .map((value, position) => ({ definitionId: field.id, position, value }));
      });
  }

  isInternalUser(): boolean {
    const role = this.auth.user()?.role;
    return role === 'TEAM' || role === 'ADMIN';
  }

  visibleScopes(): FieldScope[] {
    return this.isInternalUser() ? ['USER', 'TEAM'] : ['USER'];
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

  private sortFields(fields: SegnalazioneCampo[]): SegnalazioneCampo[] {
    return [...fields].sort((a, b) => a.code.localeCompare(b.code, 'it'));
  }

}
