import { Component, Input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CheckboxModule } from 'primeng/checkbox';
import { FileRemoveEvent, FileSelectEvent, FileUploadModule } from 'primeng/fileupload';
import { InputTextModule } from 'primeng/inputtext';
import { MultiSelectModule } from 'primeng/multiselect';
import { SelectModule } from 'primeng/select';
import { FieldScope, IssueField, IssueFieldOption } from './issues.service';

export type IssueFormValue = string | string[] | null;

export interface IssueFormModel {
  title: string;
  description: string;
  values: Record<number, IssueFormValue>;
  attachments: Record<number, File[]>;
  internal: boolean;
}

@Component({
  selector: 'app-issue-form',
  imports: [CheckboxModule, FileUploadModule, FormsModule, InputTextModule, MultiSelectModule, SelectModule],
  template: `
    <div class="issue-form-preview">
      <section class="issue-form-section">
        @if (formTitle) {
          <h3>{{ formTitle }}</h3>
        }
        <div class="issue-form-grid">
          @if (showStandardFields) {
            <div class="issue-form-field span-2">
              <label>Titolo *</label>
              <input pInputText name="issue-title" [(ngModel)]="model.title" required maxlength="255"
                     placeholder="Titolo della segnalazione" />
            </div>
          }

          @for (field of orderedFields(); track field.id) {
            @if (field.type !== 'ATTACHMENTS') {
              <div class="issue-form-field" [class.span-2]="field.type === 'TEXTAREA'">
                <label>
                  {{ field.label }}@if (field.mandatory) { <span> *</span> }
                </label>
                @switch (field.type) {
                  @case ('TEXT') {
                    <input pInputText [name]="'field-' + field.id" [(ngModel)]="model.values[field.id]"
                           [required]="field.mandatory" [placeholder]="field.code" />
                  }
                  @case ('TEXTAREA') {
                    <textarea [name]="'field-' + field.id" [(ngModel)]="model.values[field.id]"
                              [required]="field.mandatory" rows="3" [placeholder]="field.code"></textarea>
                  }
                  @case ('NUMBER') {
                    <input pInputText type="number" [name]="'field-' + field.id" [(ngModel)]="model.values[field.id]"
                           [required]="field.mandatory" placeholder="0" />
                  }
                  @case ('SELECT') {
                    @if (field.multiple) {
                      <p-multiselect [name]="'field-' + field.id" [options]="activeOptionsFor(field)"
                                     optionLabel="label" optionValue="value" [(ngModel)]="model.values[field.id]"
                                     [required]="field.mandatory" placeholder="Seleziona valori"
                                     display="chip" appendTo="body" />
                    } @else {
                      <p-select [name]="'field-' + field.id" [options]="activeOptionsFor(field)"
                                optionLabel="label" optionValue="value" [(ngModel)]="model.values[field.id]"
                                [required]="field.mandatory" placeholder="Seleziona un valore"
                                appendTo="body" />
                    }
                  }
                }
                @if (field.description) { <small class="field-description">{{ field.description }}</small> }
                @else if (field.multiple) { <small>Permette più valori.</small> }
              </div>
            }
          }

          @if (showStandardFields) {
            <div class="issue-form-field span-2">
              <label>Descrizione *</label>
              <textarea name="issue-description" [(ngModel)]="model.description" required rows="4"
                        placeholder="Descrizione dettagliata della richiesta o anomalia."></textarea>
            </div>

            @if (showInternalControl) {
              <label class="issue-form-check span-2">
                <p-checkbox name="issue-internal" [(ngModel)]="model.internal" [binary]="true" inputId="issue-internal" />
                <span>Visibile solo internamente</span>
              </label>
            }
          }

          @for (field of orderedFields(); track field.id) {
            @if (field.type === 'ATTACHMENTS') {
              <div class="issue-form-field span-2">
                <label>
                  {{ field.label }}@if (field.mandatory) { <span> *</span> }
                </label>
                <p-fileupload mode="advanced" styleClass="app-file-upload" [multiple]="field.multiple" [customUpload]="true"
                              [showUploadButton]="false" [auto]="false" chooseLabel="Seleziona file"
                              cancelLabel="Svuota" (onSelect)="setFiles(field.id, $event)"
                              (onClear)="clearFiles(field.id)" (onRemove)="removeFile(field.id, $event)" />
                @if (field.description) { <small class="field-description">{{ field.description }}</small> }
                @else if (field.multiple) { <small>Permette più file.</small> }
              </div>
            }
          }

        </div>
      </section>
    </div>
  `,
  styleUrl: './issue-form.component.css'
})
export class IssueFormComponent {
  @Input({ required: true }) model!: IssueFormModel;
  @Input() fields: IssueField[] = [];
  @Input() optionsByField = new Map<number, IssueFieldOption[]>();
  @Input() formTitle: string | null = null;
  @Input() visibleScopes: FieldScope[] = ['USER'];
  @Input() showStandardFields = true;
  @Input() showInternalControl = false;

  orderedFields(): IssueField[] {
    const userFields = this.fields.filter(field => this.visibleScopes.includes(field.scope));
    return [
      ...userFields.filter(field => field.type !== 'ATTACHMENTS'),
      ...userFields.filter(field => field.type === 'ATTACHMENTS')
    ];
  }

  activeOptionsFor(field: IssueField): IssueFieldOption[] {
    return (this.optionsByField.get(field.id) ?? []).filter(option => option.active);
  }

  clearFiles(fieldId: number): void {
    this.model.attachments[fieldId] = [];
  }

  setFiles(fieldId: number, event: FileSelectEvent): void {
    if (event.currentFiles.length === 0) return;
    if (!this.fields.find(field => field.id === fieldId)?.multiple) {
      this.model.attachments[fieldId] = [event.currentFiles[event.currentFiles.length - 1]];
      return;
    }

    const previous = this.model.attachments[fieldId] ?? [];
    const selected = [...previous, ...event.currentFiles];
    this.model.attachments[fieldId] = selected.filter((file, index, files) =>
      files.findIndex(candidate => this.sameFile(candidate, file)) === index);
  }

  removeFile(fieldId: number, event: FileRemoveEvent): void {
    this.model.attachments[fieldId] = (this.model.attachments[fieldId] ?? [])
      .filter(file => !this.sameFile(file, event.file));
  }

  private sameFile(left: File, right: File): boolean {
    return left.name === right.name && left.size === right.size
      && left.lastModified === right.lastModified && left.type === right.type;
  }
}
