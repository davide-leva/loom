import { Component, Input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { IssueField, IssueFieldOption } from './issues.service';

export interface IssueFormModel {
  title: string;
  description: string;
  values: Record<number, string>;
  attachments: Record<number, File[]>;
}

@Component({
  selector: 'app-issue-form',
  imports: [FormsModule, InputTextModule, SelectModule],
  template: `
    <div class="issue-form-preview">
      <section class="issue-form-section">
        @if (formTitle) {
          <h3>{{ formTitle }}</h3>
        }
        <div class="issue-form-grid">
          <div class="issue-form-field span-2">
            <label>Titolo *</label>
            <input pInputText name="issue-title" [(ngModel)]="model.title" required maxlength="255"
                   placeholder="Titolo della segnalazione" />
          </div>

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
                    <p-select [name]="'field-' + field.id" [options]="activeOptionsFor(field)"
                              optionLabel="label" optionValue="value" [(ngModel)]="model.values[field.id]"
                              [required]="field.mandatory"
                              [placeholder]="field.multiple ? 'Seleziona uno o più valori' : 'Seleziona un valore'"
                              appendTo="body" />
                  }
                }
                @if (field.multiple) { <small>Permette più valori.</small> }
              </div>
            }
          }

          <div class="issue-form-field span-2">
            <label>Descrizione *</label>
            <textarea name="issue-description" [(ngModel)]="model.description" required rows="4"
                      placeholder="Descrizione dettagliata della richiesta o anomalia."></textarea>
          </div>

          @for (field of orderedFields(); track field.id) {
            @if (field.type === 'ATTACHMENTS') {
              <div class="issue-form-field span-2">
                <label>
                  {{ field.label }}@if (field.mandatory) { <span> *</span> }
                </label>
                <input type="file" [multiple]="field.multiple" (change)="setFiles(field.id, $event)" />
                @if (field.multiple) { <small>Permette più file.</small> }
              </div>
            }
          }

          @if (fields.length === 0) {
            <p class="empty-details span-2">Nessun campo custom USER configurato.</p>
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

  orderedFields(): IssueField[] {
    const userFields = this.fields.filter(field => field.scope === 'USER');
    return [
      ...userFields.filter(field => field.type !== 'ATTACHMENTS'),
      ...userFields.filter(field => field.type === 'ATTACHMENTS')
    ];
  }

  activeOptionsFor(field: IssueField): IssueFieldOption[] {
    return (this.optionsByField.get(field.id) ?? []).filter(option => option.active);
  }

  setFiles(fieldId: number, event: Event): void {
    const input = event.target as HTMLInputElement;
    this.model.attachments[fieldId] = Array.from(input.files ?? []);
  }
}
