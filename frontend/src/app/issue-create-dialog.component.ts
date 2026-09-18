import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { forkJoin, of } from 'rxjs';
import { IssueFormComponent, IssueFormModel } from './issue-form.component';
import {
  IssueField,
  IssueFieldOption,
  IssueFieldValueInput,
  IssueSummary,
  IssuesService,
  ProjectUserSummary
} from './issues.service';

@Component({
  selector: 'app-issue-create-dialog',
  imports: [ButtonModule, DialogModule, FormsModule, IssueFormComponent],
  template: `
    <p-dialog header="Nuova segnalazione" [(visible)]="visible" [modal]="true"
              [style]="{ width: '860px', maxWidth: '96vw' }" [breakpoints]="{ '720px': '96vw' }"
              [draggable]="false" [resizable]="false" (onHide)="closed.emit()">
      <form class="dialog-form" #issueForm="ngForm" (ngSubmit)="save()">

        @if (schemaLoading) {
          <p class="loading-message">Carico campi del progetto...</p>
        } @else {
          <app-issue-form [model]="formModel" [fields]="fields" [optionsByField]="optionsByField" />
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
export class IssueCreateDialogComponent {
  private readonly issuesApi = inject(IssuesService);

  @Input({ required: true }) projectId: number | null = null;
  @Input() users: ProjectUserSummary[] = [];
  @Output() created = new EventEmitter<IssueSummary>();
  @Output() closed = new EventEmitter<void>();

  visible = true;
  saving = false;
  schemaLoading = false;
  error = '';
  fields: IssueField[] = [];
  optionsByField = new Map<number, IssueFieldOption[]>();
  formModel: IssueFormModel = { title: '', description: '', values: {}, attachments: {} };


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
    this.issuesApi.createIssue({
      projectId: this.projectId,
      title: this.formModel.title.trim(),
      description: this.formModel.description.trim(),
      values: this.customValues()
    }).subscribe({
      next: issue => this.uploadAttachments(issue),
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

  private uploadAttachments(issue: IssueSummary): void {
    const uploads = Object.entries(this.formModel.attachments)
      .flatMap(([fieldId, files]) => files.map(file => this.issuesApi.uploadAttachment(issue.id, Number(fieldId), file)));
    if (uploads.length === 0) {
      this.saving = false;
      this.created.emit(issue);
      this.close();
      return;
    }
    forkJoin(uploads.length ? uploads : [of(null)]).subscribe({
      next: () => {
        this.saving = false;
        this.created.emit(issue);
        this.close();
      },
      error: () => {
        this.saving = false;
        this.error = 'Segnalazione creata, ma non riesco a caricare uno o più allegati.';
        this.created.emit(issue);
      }
    });
  }

  private loadSchema(projectId: number): void {
    this.loadedProjectId = projectId;
    this.schemaLoading = true;
    this.error = '';
    forkJoin({
      fields: this.issuesApi.issueFields(projectId),
      options: this.issuesApi.issueFieldOptions(projectId)
    }).subscribe({
      next: ({ fields, options }) => {
        if (this.projectId !== projectId) return;
        this.fields = this.sortFields(fields);
        this.optionsByField = this.groupOptions(options);
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
      .filter(field => field.mandatory && field.type !== 'ATTACHMENTS')
      .every(field => (this.formModel.values[field.id] ?? '').trim().length > 0);
  }

  private customValues(): IssueFieldValueInput[] {
    return this.fields
      .filter(field => field.type !== 'ATTACHMENTS')
      .flatMap(field => {
        const value = (this.formModel.values[field.id] ?? '').trim();
        return value ? [{ definitionId: field.id, position: 0, value }] : [];
      });
  }

  private groupOptions(options: IssueFieldOption[]): Map<number, IssueFieldOption[]> {
    const output = new Map<number, IssueFieldOption[]>();
    for (const option of options.filter(item => item.active)) {
      output.set(option.definitionId, [...(output.get(option.definitionId) ?? []), option]);
    }
    for (const [fieldId, fieldOptions] of output.entries()) {
      output.set(fieldId, fieldOptions.sort((a, b) => a.label.localeCompare(b.label, 'it')));
    }
    return output;
  }

  private sortFields(fields: IssueField[]): IssueField[] {
    return [...fields].sort((a, b) => a.code.localeCompare(b.code, 'it'));
  }

}
