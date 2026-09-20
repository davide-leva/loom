import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { InputTextarea } from 'primeng/inputtextarea';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { finalize, forkJoin } from 'rxjs';
import {
  AdminConfigService,
  FieldScope,
  FieldType,
  IssueField,
  IssueFieldInput,
  IssueFieldOption,
  IssueFieldOptionInput,
  Project
} from './admin-config.service';
import { IssueFormComponent, IssueFormModel } from '../issue-form.component';
import { EntityColumn, EntityTableComponent } from './entity-table.component';

type FieldDraft = IssueFieldInput;
type OptionDraft = Required<Pick<IssueFieldOptionInput, 'value' | 'label'>> & { active: boolean };

@Component({
  selector: 'app-ticket-fields',
  imports: [FormsModule, ButtonModule, CardModule, DialogModule, InputTextModule, InputTextarea, SelectModule,
    TableModule, EntityTableComponent, IssueFormComponent],
  templateUrl: './ticket-fields.component.html',
  styleUrl: './ticket-fields.component.css'
})
export class TicketFieldsComponent implements OnInit {
  private readonly api = inject(AdminConfigService);

  readonly fieldColumns: EntityColumn[] = [
    { field: 'code', label: 'Codice' },
    { field: 'label', label: 'Etichetta' },
    { field: 'typeLabel', label: 'Tipo' },
    { field: 'scopeLabel', label: 'Scope' },
    { field: 'mandatoryLabel', label: 'Obbligatorio' },
    { field: 'multipleLabel', label: 'Multiplo' }
  ];
  readonly typeOptions: { label: string; value: FieldType }[] = [
    { label: 'Testo breve', value: 'TEXT' },
    { label: 'Testo lungo', value: 'TEXTAREA' },
    { label: 'Numero', value: 'NUMBER' },
    { label: 'Selezione', value: 'SELECT' },
    { label: 'Allegati', value: 'ATTACHMENTS' }
  ];
  readonly scopeOptions: { label: string; value: FieldScope }[] = [
    { label: 'User', value: 'USER' },
    { label: 'Superuser', value: 'SUPERUSER' },
    { label: 'Team', value: 'TEAM' }
  ];

  projects: Project[] = [];
  selectedProjectId: number | null = null;
  projectLoading = false;
  projectError = '';

  fields: IssueField[] = [];
  fieldRows: (IssueField & { typeLabel: string; scopeLabel: string; mandatoryLabel: string; multipleLabel: string })[] = [];
  fieldsLoading = false;
  fieldsError = '';

  fieldFormVisible = false;
  editingField: IssueField | null = null;
  fieldDraft: FieldDraft = this.emptyField();
  fieldSaveError = '';
  savingField = false;

  deleteFieldVisible = false;
  fieldToDelete: IssueField | null = null;
  deleteFieldError = '';
  deletingField = false;

  selectedField: IssueField | null = null;
  fieldDetailVisible = false;
  options: IssueFieldOption[] = [];
  optionsLoading = false;
  optionsError = '';
  optionFormVisible = false;
  editingOption: IssueFieldOption | null = null;
  optionDraft: OptionDraft = this.emptyOption();
  optionSaveError = '';
  savingOption = false;
  deleteOptionVisible = false;
  optionToDelete: IssueFieldOption | null = null;
  deleteOptionError = '';
  deletingOption = false;
  previewVisible = false;
  previewLoading = false;
  previewOptions = new Map<number, IssueFieldOption[]>();
  previewModel: IssueFormModel = { title: '', description: '', values: {}, attachments: {}, internal: false };

  ngOnInit(): void {
    this.loadProjects();
  }

  loadProjects(): void {
    this.projectLoading = true;
    this.projectError = '';
    forkJoin({ projects: this.api.projects() }).pipe(finalize(() => this.projectLoading = false)).subscribe({
      next: ({ projects }) => {
        this.projects = [...projects].sort((a, b) => a.name.localeCompare(b.name, 'it'));
        const selected = this.selectedProjectId === null
          ? this.projects[0]
          : this.projects.find(project => project.id === this.selectedProjectId) ?? this.projects[0];
        this.selectedProjectId = selected?.id ?? null;
        if (this.selectedProjectId !== null) this.loadFields();
      },
      error: () => this.projectError = 'Impossibile caricare i progetti. Riprova.'
    });
  }

  selectProject(projectId: number | null): void {
    this.selectedProjectId = projectId;
    this.fields = [];
    this.fieldRows = [];
    this.selectedField = null;
    this.fieldDetailVisible = false;
    this.editingField = null;
    this.fieldDraft = this.emptyField();
    this.options = [];
    this.previewOptions.clear();
    if (projectId !== null) this.loadFields();
  }

  loadFields(): void {
    const projectId = this.selectedProjectId;
    if (projectId === null) return;
    this.fieldsLoading = true;
    this.fieldsError = '';
    this.api.issueFields(projectId).pipe(finalize(() => this.fieldsLoading = false)).subscribe({
      next: fields => {
        if (this.selectedProjectId !== projectId) return;
        this.fields = this.sortFields(fields);
        this.updateFieldRows();
        if (this.selectedField && !this.fields.some(field => field.id === this.selectedField?.id)) {
          this.selectedField = null;
          this.fieldDetailVisible = false;
          this.editingField = null;
          this.fieldDraft = this.emptyField();
          this.options = [];
        }
        this.previewOptions.clear();
      },
      error: () => this.fieldsError = 'Impossibile caricare i campi del progetto. Riprova.'
    });
  }

  showNewField(): void {
    this.editingField = null;
    this.fieldDraft = this.emptyField();
    this.fieldSaveError = '';
    this.fieldFormVisible = true;
  }

  closeFieldForm(): void {
    if (this.savingField) return;
    this.fieldFormVisible = false;
    this.editingField = null;
    this.fieldDraft = this.emptyField();
    this.fieldSaveError = '';
  }

  saveField(): void {
    const projectId = this.selectedProjectId;
    if (projectId === null || this.savingField) return;
    const description = (this.fieldDraft.description ?? '').trim();
    const input: FieldDraft = {
      code: this.fieldDraft.code.trim().toUpperCase(),
      label: this.fieldDraft.label.trim(),
      description: description.length > 0 ? description : null,
      type: this.fieldDraft.type,
      scope: this.fieldDraft.scope,
      mandatory: this.fieldDraft.mandatory,
      multiple: this.fieldDraft.multiple
    };
    if (!input.code || !/^[A-Z0-9_]{1,8}$/.test(input.code) || !input.label) return;

    this.savingField = true;
    this.fieldSaveError = '';
    const editing = this.editingField;
    const editingInDetail = editing !== null && this.fieldDetailVisible
      && this.selectedField?.id === editing.id;
    const request = editing
      ? this.api.updateIssueField(editing.id, input)
      : this.api.createIssueField({ ...input, projectId });
    request.pipe(finalize(() => this.savingField = false)).subscribe({
      next: field => {
        this.fields = this.sortFields(editing
          ? this.fields.map(existing => existing.id === field.id ? field : existing)
          : [...this.fields, field]);
        this.updateFieldRows();
        if (editingInDetail) {
          this.selectedField = field;
          this.editingField = field;
          this.fieldDraft = this.fieldDraftFrom(field);
          this.options = [];
          if (field.type === 'SELECT') this.loadOptions();
        } else {
          this.fieldFormVisible = false;
          this.editingField = null;
          this.fieldDraft = this.emptyField();
        }
        this.previewOptions.clear();
      },
      error: (error: unknown) => {
        this.fieldSaveError = error instanceof HttpErrorResponse && error.status === 409
          ? 'Codice già presente nel progetto o campo già usato con vincoli incompatibili.'
          : 'Impossibile salvare il campo. Controlla i dati e riprova.';
      }
    });
  }

  confirmDeleteField(field: IssueField): void {
    this.fieldToDelete = field;
    this.deleteFieldError = '';
    this.deleteFieldVisible = true;
  }

  deleteField(): void {
    const field = this.fieldToDelete;
    if (!field || this.deletingField) return;
    this.deletingField = true;
    this.deleteFieldError = '';
    this.api.deleteIssueField(field.id).pipe(finalize(() => this.deletingField = false)).subscribe({
      next: () => {
        this.fields = this.fields.filter(existing => existing.id !== field.id);
        this.updateFieldRows();
        if (this.selectedField?.id === field.id) {
          this.selectedField = null;
          this.fieldDetailVisible = false;
          this.editingField = null;
          this.fieldDraft = this.emptyField();
          this.options = [];
        }
        this.previewOptions.clear();
        this.deleteFieldVisible = false;
        this.fieldToDelete = null;
      },
      error: () => this.deleteFieldError = 'Impossibile eliminare il campo. Potrebbe essere usato da issue esistenti.'
    });
  }

  openField(field: IssueField): void {
    this.selectedField = field;
    this.editingField = field;
    this.fieldDraft = this.fieldDraftFrom(field);
    this.fieldSaveError = '';
    this.fieldDetailVisible = true;
    this.optionFormVisible = false;
    this.editingOption = null;
    this.options = [];
    if (field.type === 'SELECT') this.loadOptions();
  }

  closeField(): void {
    if (this.savingField || this.savingOption || this.deletingOption) return;
    this.fieldDetailVisible = false;
    this.editingField = null;
    this.fieldDraft = this.emptyField();
    this.fieldSaveError = '';
    this.selectedField = null;
    this.options = [];
    this.optionFormVisible = false;
    this.editingOption = null;
    this.optionDraft = this.emptyOption();
  }

  loadOptions(): void {
    const field = this.selectedField;
    if (!field || field.type !== 'SELECT') return;
    this.optionsLoading = true;
    this.optionsError = '';
    this.api.issueFieldOptions(field.id).pipe(finalize(() => this.optionsLoading = false)).subscribe({
      next: options => {
        if (this.selectedField?.id === field.id) this.options = this.sortOptions(options);
      },
      error: () => this.optionsError = 'Impossibile caricare le opzioni. Riprova.'
    });
  }

  showNewOption(): void {
    this.editingOption = null;
    this.optionDraft = this.emptyOption();
    this.optionSaveError = '';
    this.optionFormVisible = true;
  }

  editOption(option: IssueFieldOption): void {
    this.editingOption = option;
    this.optionDraft = { value: option.value, label: option.label, active: option.active };
    this.optionSaveError = '';
    this.optionFormVisible = true;
  }

  saveOption(): void {
    const field = this.selectedField;
    if (!field || field.type !== 'SELECT' || this.savingOption) return;
    const input: OptionDraft = {
      value: this.optionDraft.value.trim(),
      label: this.optionDraft.label.trim(),
      active: this.optionDraft.active
    };
    if (!input.value || !input.label) return;

    this.savingOption = true;
    this.optionSaveError = '';
    const request = this.editingOption
      ? this.api.updateIssueFieldOption(this.editingOption.id, input)
      : this.api.createIssueFieldOption({ definitionId: field.id, value: input.value, label: input.label });
    request.pipe(finalize(() => this.savingOption = false)).subscribe({
      next: option => {
        this.options = this.sortOptions(this.editingOption
          ? this.options.map(existing => existing.id === option.id ? option : existing)
          : [...this.options, option]);
        this.previewOptions.delete(field.id);
        this.optionFormVisible = false;
        this.editingOption = null;
        this.optionDraft = this.emptyOption();
      },
      error: (error: unknown) => {
        this.optionSaveError = error instanceof HttpErrorResponse && error.status === 409
          ? 'Opzione già usata o non rinominabile perché presente in issue esistenti.'
          : 'Impossibile salvare l’opzione. Controlla i dati e riprova.';
      }
    });
  }

  confirmDeleteOption(option: IssueFieldOption): void {
    this.optionToDelete = option;
    this.deleteOptionError = '';
    this.deleteOptionVisible = true;
  }

  deleteOption(): void {
    const option = this.optionToDelete;
    if (!option || this.deletingOption) return;
    this.deletingOption = true;
    this.deleteOptionError = '';
    this.api.deleteIssueFieldOption(option.id).pipe(finalize(() => this.deletingOption = false)).subscribe({
      next: () => {
        this.options = this.options.filter(existing => existing.id !== option.id);
        if (this.selectedField) this.previewOptions.delete(this.selectedField.id);
        this.deleteOptionVisible = false;
        this.optionToDelete = null;
      },
      error: () => this.deleteOptionError = 'Impossibile eliminare l’opzione. Se è usata, disattivala.'
    });
  }

  typeLabel(type: FieldType): string {
    return this.typeOptions.find(option => option.value === type)?.label ?? type;
  }

  scopeLabel(scope: FieldScope): string {
    return this.scopeOptions.find(option => option.value === scope)?.label ?? scope;
  }

  openPreview(): void {
    if (this.selectedProjectId === null || this.previewLoading) return;
    const selectFields = this.previewFields().filter(field => field.type === 'SELECT');
    if (selectFields.length === 0) {
      this.previewVisible = true;
      return;
    }

    this.previewLoading = true;
    const requests = Object.fromEntries(selectFields.map(field => [
      field.id,
      this.api.issueFieldOptions(field.id)
    ]));
    forkJoin(requests).pipe(finalize(() => this.previewLoading = false)).subscribe({
      next: result => {
        this.previewOptions = new Map(Object.entries(result)
          .map(([fieldId, options]) => [Number(fieldId), this.sortOptions(options)
            .filter(option => option.active)]));
        this.previewVisible = true;
      },
      error: () => this.fieldsError = 'Impossibile caricare le opzioni per la preview. Riprova.'
    });
  }

  activeOptionsFor(field: IssueField): IssueFieldOption[] {
    return this.previewOptions.get(field.id) ?? [];
  }

  previewFields(): IssueField[] {
    const userFields = this.fields.filter(field => field.scope === 'USER');
    return [
      ...userFields.filter(field => field.type !== 'ATTACHMENTS'),
      ...userFields.filter(field => field.type === 'ATTACHMENTS')
    ];
  }

  selectedProjectName(): string {
    return this.projects.find(project => project.id === this.selectedProjectId)?.name ?? 'Progetto';
  }

  private emptyField(): FieldDraft {
    return { code: '', label: '', description: null, type: 'TEXT', scope: 'USER', mandatory: false, multiple: false };
  }

  private fieldDraftFrom(field: IssueField): FieldDraft {
    return {
      code: field.code,
      label: field.label,
      description: field.description ?? null,
      type: field.type,
      scope: field.scope,
      mandatory: field.mandatory,
      multiple: field.multiple
    };
  }

  private emptyOption(): OptionDraft {
    return { value: '', label: '', active: true };
  }

  private sortFields(fields: IssueField[]): IssueField[] {
    return [...fields].sort((a, b) => a.code.localeCompare(b.code, 'it'));
  }

  private sortOptions(options: IssueFieldOption[]): IssueFieldOption[] {
    return [...options].sort((a, b) => a.label.localeCompare(b.label, 'it'));
  }

  private updateFieldRows(): void {
    this.fieldRows = this.fields.map(field => ({
      ...field,
      typeLabel: this.typeLabel(field.type),
      scopeLabel: this.scopeLabel(field.scope),
      mandatoryLabel: field.mandatory ? 'Si' : 'No',
      multipleLabel: field.multiple ? 'Si' : 'No'
    }));
  }
}
