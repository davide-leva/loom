import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { Subject } from 'rxjs';
import { TicketFieldsComponent } from './ticket-fields.component';
import { AdminConfigService } from '../../../services/config/admin-config/admin-config.service';
import type { IssueField, IssueFieldOption, Project } from '../../../services/config/admin-config/admin-config.service';

class AdminConfigStub {
  projects$ = new Subject<Project[]>();
  projects = jest.fn(() => this.projects$.asObservable());
  issueFields$ = new Subject<IssueField[]>();
  issueFields = jest.fn(() => this.issueFields$.asObservable());
  issueFieldOptions$ = new Subject<IssueFieldOption[]>();
  issueFieldOptions = jest.fn(() => this.issueFieldOptions$.asObservable());
  createIssueField$ = new Subject<IssueField>();
  createIssueField = jest.fn(() => this.createIssueField$.asObservable());
  updateIssueField$ = new Subject<IssueField>();
  updateIssueField = jest.fn(() => this.updateIssueField$.asObservable());
  deleteIssueField$ = new Subject<void>();
  deleteIssueField = jest.fn(() => this.deleteIssueField$.asObservable());
  createIssueFieldOption$ = new Subject<IssueFieldOption>();
  createIssueFieldOption = jest.fn(() => this.createIssueFieldOption$.asObservable());
  updateIssueFieldOption$ = new Subject<IssueFieldOption>();
  updateIssueFieldOption = jest.fn(() => this.updateIssueFieldOption$.asObservable());
  deleteIssueFieldOption$ = new Subject<void>();
  deleteIssueFieldOption = jest.fn(() => this.deleteIssueFieldOption$.asObservable());

  newIssueFieldsStream(): void { this.issueFields$ = new Subject<IssueField[]>(); }
}

function project(partial: Partial<Project>): Project {
  return { id: 1, name: 'P1', companyId: null, archiveAfterDays: null, logoUrl: null, ...partial };
}

function field(partial: Partial<IssueField>): IssueField {
  return {
    id: 1, projectId: 1, code: 'X', label: 'X', description: null,
    type: 'TEXT', scope: 'USER', mandatory: false, multiple: false,
    ...partial
  } as IssueField;
}

function option(partial: Partial<IssueFieldOption>): IssueFieldOption {
  return { id: 1, definitionId: 1, projectId: 1, value: 'v1', label: 'V1', active: true, ...partial };
}

describe('TicketFieldsComponent', () => {
  let fixture: ComponentFixture<TicketFieldsComponent>;
  let component: TicketFieldsComponent;
  let api: AdminConfigStub;

  beforeEach(async () => {
    api = new AdminConfigStub();
    await TestBed.configureTestingModule({
      imports: [TicketFieldsComponent],
      providers: [
        provideAnimationsAsync('noop'),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AdminConfigService, useValue: api }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(TicketFieldsComponent);
    component = fixture.componentInstance;
  });

  function finishInitialLoad() {
    component.ngOnInit();
    api.projects$.next([project({ id: 1, name: 'P1' })]);
    api.projects$.complete();
    api.issueFields$.next([]);
    api.issueFields$.complete();
  }

  describe('loadProjects() and loadFields()', () => {
    it('auto-selects first project and loads fields', () => {
      component.ngOnInit();
      api.projects$.next([project({ id: 5, name: 'P5' })]);
      api.projects$.complete();
      expect(component.selectedProjectId).toBe(5);
      expect(api.issueFields).toHaveBeenCalledWith(5);
    });

    it('sets projectError on failure', () => {
      component.ngOnInit();
      api.projects$.error(new Error('boom'));
      expect(component.projectError).toBe('Impossibile caricare i progetti. Riprova.');
    });

    it('loadFields() sorts fields and updates rows', () => {
      finishInitialLoad();
      api.newIssueFieldsStream();
      component.loadFields();
      api.issueFields$.next([
        field({ id: 1, code: 'B', label: 'B', type: 'TEXT', scope: 'TEAM' }),
        field({ id: 2, code: 'A', label: 'A', type: 'TEXT', scope: 'USER' })
      ]);
      api.issueFields$.complete();
      expect(component.fields.map(f => f.code)).toEqual(['A', 'B']);
      expect(component.fieldRows[0].typeLabel).toBe('Testo breve');
      expect(component.fieldRows[1].scopeLabel).toBe('Team');
    });
  });

  describe('selectProject()', () => {
    it('clears state and loads fields for new project', () => {
      finishInitialLoad();
      component.fields = [field({ id: 1 })];
      component.selectedField = field({ id: 1 });
      component.fieldDetailVisible = true;
      component.selectProject(2);
      expect(component.selectedProjectId).toBe(2);
      expect(component.fields).toEqual([]);
      expect(component.selectedField).toBeNull();
      expect(api.issueFields).toHaveBeenCalledWith(2);
    });

    it('does nothing when null', () => {
      finishInitialLoad();
      api.issueFields.mockClear();
      component.selectProject(null);
      expect(api.issueFields).not.toHaveBeenCalled();
    });
  });

  describe('saveField()', () => {
    beforeEach(() => finishInitialLoad());

    it('rejects invalid code', () => {
      component.fieldDraft.code = 'lowercase';
      component.fieldDraft.label = 'X';
      component.saveField();
      expect(api.createIssueField).not.toHaveBeenCalled();
    });

    it('rejects too-long code', () => {
      component.fieldDraft.code = 'TOOLONGCODE';
      component.fieldDraft.label = 'X';
      component.saveField();
      expect(api.createIssueField).not.toHaveBeenCalled();
    });

    it('rejects empty label', () => {
      component.fieldDraft.code = 'ABC';
      component.fieldDraft.label = '  ';
      component.saveField();
      expect(api.createIssueField).not.toHaveBeenCalled();
    });

    it('creates field with uppercased trimmed code', () => {
      component.fieldDraft.code = '  ab1  ';
      component.fieldDraft.label = '  Bravo  ';
      component.fieldDraft.description = '  desc  ';
      component.saveField();
      const sent = api.createIssueField.mock.calls[0][0];
      expect(sent.code).toBe('AB1');
      expect(sent.label).toBe('Bravo');
      expect(sent.description).toBe('desc');
      expect(sent.projectId).toBe(1);
    });

    it('description becomes null when empty', () => {
      component.fieldDraft.code = 'AB1';
      component.fieldDraft.label = 'X';
      component.fieldDraft.description = '   ';
      component.saveField();
      expect(api.createIssueField.mock.calls[0][0].description).toBeNull();
    });

    it('409 sets conflict message', () => {
      component.fieldDraft.code = 'AB1';
      component.fieldDraft.label = 'X';
      component.saveField();
      api.createIssueField$.error(new HttpErrorResponse({ status: 409 }));
      api.createIssueField$.complete();
      expect(component.fieldSaveError).toBe('Codice già presente nel progetto o campo già usato con vincoli incompatibili.');
    });

    it('non-409 sets generic message', () => {
      component.fieldDraft.code = 'AB1';
      component.fieldDraft.label = 'X';
      component.saveField();
      api.createIssueField$.error(new Error('boom'));
      api.createIssueField$.complete();
      expect(component.fieldSaveError).toBe('Impossibile salvare il campo. Controlla i dati e riprova.');
    });
  });

  describe('openField() and loadOptions()', () => {
    beforeEach(() => finishInitialLoad());

    it('openField() loads options for SELECT', () => {
      const f = field({ id: 5, code: 'SEV', type: 'SELECT' });
      component.openField(f);
      expect(component.selectedField?.id).toBe(5);
      expect(component.fieldDetailVisible).toBe(true);
      expect(api.issueFieldOptions).toHaveBeenCalledWith(5);
    });

    it('openField() does not load options for TEXT', () => {
      const f = field({ id: 6, code: 'TXT', type: 'TEXT' });
      api.issueFieldOptions.mockClear();
      component.openField(f);
      expect(api.issueFieldOptions).not.toHaveBeenCalled();
    });

    it('loadOptions() stores sorted options', () => {
      component.selectedField = field({ id: 5, type: 'SELECT' });
      component.loadOptions();
      api.issueFieldOptions$.next([
        option({ id: 1, value: 'b', label: 'B' }),
        option({ id: 2, value: 'a', label: 'A' })
      ]);
      api.issueFieldOptions$.complete();
      expect(component.options.map(o => o.label)).toEqual(['A', 'B']);
    });
  });

  describe('saveOption()', () => {
    beforeEach(() => finishInitialLoad());

    it('noops without selected SELECT field', () => {
      component.selectedField = field({ id: 5, type: 'TEXT' });
      component.optionDraft.value = 'v';
      component.optionDraft.label = 'L';
      component.saveOption();
      expect(api.createIssueFieldOption).not.toHaveBeenCalled();
    });

    it('rejects empty value or label', () => {
      component.selectedField = field({ id: 5, type: 'SELECT' });
      component.optionDraft.value = '';
      component.optionDraft.label = 'L';
      component.saveOption();
      expect(api.createIssueFieldOption).not.toHaveBeenCalled();
    });

    it('creates option with trimmed values', () => {
      component.selectedField = field({ id: 5, type: 'SELECT' });
      component.optionDraft.value = '  v  ';
      component.optionDraft.label = '  L  ';
      component.saveOption();
      expect(api.createIssueFieldOption).toHaveBeenCalledWith({ definitionId: 5, value: 'v', label: 'L' });
      api.createIssueFieldOption$.next(option({ id: 7, value: 'v', label: 'L' }));
      api.createIssueFieldOption$.complete();
      expect(component.options.some(o => o.id === 7)).toBe(true);
      expect(component.optionFormVisible).toBe(false);
    });

    it('updates option when editingOption set', () => {
      component.selectedField = field({ id: 5, type: 'SELECT' });
      component.editingOption = option({ id: 7, value: 'v', label: 'L' });
      component.optionDraft.value = 'newv';
      component.optionDraft.label = 'New L';
      component.saveOption();
      expect(api.updateIssueFieldOption).toHaveBeenCalledWith(7, { value: 'newv', label: 'New L', active: true });
    });

    it('409 sets conflict message', () => {
      component.selectedField = field({ id: 5, type: 'SELECT' });
      component.optionDraft.value = 'v';
      component.optionDraft.label = 'L';
      component.saveOption();
      api.createIssueFieldOption$.error(new HttpErrorResponse({ status: 409 }));
      api.createIssueFieldOption$.complete();
      expect(component.optionSaveError).toBe('Opzione già usata o non rinominabile perché presente in issue esistenti.');
    });

    it('non-409 sets generic message', () => {
      component.selectedField = field({ id: 5, type: 'SELECT' });
      component.optionDraft.value = 'v';
      component.optionDraft.label = 'L';
      component.saveOption();
      api.createIssueFieldOption$.error(new Error('boom'));
      api.createIssueFieldOption$.complete();
      expect(component.optionSaveError).toBe('Impossibile salvare l’opzione. Controlla i dati e riprova.');
    });
  });

  describe('deleteField() / deleteOption()', () => {
    beforeEach(() => finishInitialLoad());

    it('deleteField() removes from list and clears selection', () => {
      component.fields = [field({ id: 5 }), field({ id: 6 })];
      component.selectedField = field({ id: 5 });
      component.fieldDetailVisible = true;
      component.fieldToDelete = field({ id: 5 });
      component.deleteField();
      api.deleteIssueField$.next();
      api.deleteIssueField$.complete();
      expect(component.fields.map(f => f.id)).toEqual([6]);
      expect(component.selectedField).toBeNull();
    });

    it('deleteField() sets error on failure', () => {
      component.fieldToDelete = field({ id: 5 });
      component.deleteField();
      api.deleteIssueField$.error(new Error('boom'));
      api.deleteIssueField$.complete();
      expect(component.deleteFieldError).toBe('Impossibile eliminare il campo. Potrebbe essere usato da issue esistenti.');
    });

    it('deleteOption() removes option', () => {
      component.selectedField = field({ id: 5, type: 'SELECT' });
      component.options = [option({ id: 1 }), option({ id: 2 })];
      component.optionToDelete = option({ id: 1 });
      component.deleteOption();
      api.deleteIssueFieldOption$.next();
      api.deleteIssueFieldOption$.complete();
      expect(component.options.length).toBe(1);
    });

    it('deleteOption() sets error on failure', () => {
      component.optionToDelete = option({ id: 1 });
      component.deleteOption();
      api.deleteIssueFieldOption$.error(new Error('boom'));
      api.deleteIssueFieldOption$.complete();
      expect(component.deleteOptionError).toBe('Impossibile eliminare l’opzione. Se è usata, disattivala.');
    });
  });

  describe('typeLabel() / scopeLabel() / previewFields()', () => {
    it('typeLabel and scopeLabel return localized strings', () => {
      expect(component.typeLabel('TEXT')).toBe('Testo breve');
      expect(component.typeLabel('SELECT')).toBe('Selezione');
      expect(component.scopeLabel('USER')).toBe('User');
      expect(component.scopeLabel('TEAM')).toBe('Team');
    });

    it('previewFields() filters USER scope and orders ATTACHMENTS last', () => {
      component.fields = [
        field({ id: 1, type: 'ATTACHMENTS', scope: 'USER' }),
        field({ id: 2, type: 'TEXT', scope: 'USER' }),
        field({ id: 3, type: 'SELECT', scope: 'USER' }),
        field({ id: 4, type: 'TEXT', scope: 'TEAM' })
      ];
      const ids = component.previewFields().map(f => f.id);
      expect(ids).toEqual([2, 3, 1]); // TEAM excluded; ATTACHMENTS last
    });
  });
});