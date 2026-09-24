import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideAnimations } from '@angular/platform-browser/animations';
import { Subject } from 'rxjs';
import { SegnalazioneCreateDialogComponent } from './segnalazione-create-dialog.component';
import { SegnalazioniService } from '../../services/segnalazioni/segnalazioni.service';
import { AuthService } from '../../services/auth/auth.service';
import type { CurrentUser } from '../../shared/models/auth.types';
import type { SegnalazioneCampo, SegnalazioneCampoOpzione, SegnalazioneSummary } from '../../shared/models/segnalazione.types';

class SegnalazioniStub {
  segnalazioneCampi$ = new Subject<SegnalazioneCampo[]>();
  segnalazioneCampi = jest.fn(() => this.segnalazioneCampi$.asObservable().pipe());
  segnalazioneCampoOpzioni$ = new Subject<SegnalazioneCampoOpzione[]>();
  segnalazioneCampoOpzioni = jest.fn(() => this.segnalazioneCampoOpzioni$.asObservable().pipe());
  creaSegnalazione$ = new Subject<SegnalazioneSummary>();
  creaSegnalazione = jest.fn(() => this.creaSegnalazione$.asObservable());
  uploadAttachment$ = new Subject<any>();
  uploadAttachment = jest.fn(() => this.uploadAttachment$.asObservable());

  emitFields(fields: SegnalazioneCampo[]): void {
    this.segnalazioneCampi$.next(fields);
    this.segnalazioneCampi$.complete();
  }

  emitOptions(options: SegnalazioneCampoOpzione[]): void {
    this.segnalazioneCampoOpzioni$.next(options);
    this.segnalazioneCampoOpzioni$.complete();
  }

  emitFieldsError(err: any): void {
    this.segnalazioneCampi$.error(err);
    this.segnalazioneCampi$.complete();
  }

  emitUpload(attachment: any): void {
    this.uploadAttachment$.next(attachment);
    this.uploadAttachment$.complete();
  }
}

function field(partial: Partial<SegnalazioneCampo>): SegnalazioneCampo {
  return {
    id: 1, projectId: 1, code: 'X', label: 'X', description: null,
    mandatory: false, multiple: false, type: 'TEXT', scope: 'USER',
    ...partial
  } as SegnalazioneCampo;
}

function userOf(role: string): CurrentUser {
  return {
    id: 1, username: 'mario', displayName: 'Mario', email: 'm@e.com',
    role, companyName: 'Acme', companyId: 10, primaryColor: 'blue',
    companyLogoUrl: null, internalCompanyName: 'Loom', internalLogoUrl: null
  } as CurrentUser;
}

describe('SegnalazioneCreateDialogComponent', () => {
  let fixture: ComponentFixture<SegnalazioneCreateDialogComponent>;
  let component: SegnalazioneCreateDialogComponent;
  let segnalazioniApi: SegnalazioniStub;
  let userSignal: CurrentUser | null;

  beforeEach(async () => {
    segnalazioniApi = new SegnalazioniStub();
    userSignal = userOf('USER');

    await TestBed.configureTestingModule({
      imports: [SegnalazioneCreateDialogComponent],
      providers: [
        provideAnimations(),
        { provide: SegnalazioniService, useValue: segnalazioniApi },
        { provide: AuthService, useValue: { user: () => userSignal } }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(SegnalazioneCreateDialogComponent);
    component = fixture.componentInstance;
  });

  describe('canSave() and visibility', () => {
    it('returns false when projectId is null', () => {
      component.projectId = null;
      component.formModel.title = 'T';
      component.formModel.description = 'D';
      expect(component.canSave()).toBe(false);
    });

    it('returns false with blank title or description', () => {
      component.projectId = 1;
      component.formModel.title = '  ';
      component.formModel.description = 'D';
      expect(component.canSave()).toBe(false);

      component.formModel.title = 'T';
      component.formModel.description = '';
      expect(component.canSave()).toBe(false);
    });

    it('isInternalUser() recognises TEAM and ADMIN only', () => {
      userSignal = userOf('USER');
      expect(component.isInternalUser()).toBe(false);

      userSignal = userOf('TEAM');
      expect(component.isInternalUser()).toBe(true);

      userSignal = userOf('ADMIN');
      expect(component.isInternalUser()).toBe(true);

      userSignal = userOf('SUPERUSER');
      expect(component.isInternalUser()).toBe(false);
    });

    it('visibleScopes() widens to TEAM+SUPERUSER+USER for internal users', () => {
      userSignal = userOf('USER');
      expect(component.visibleScopes()).toEqual(['USER']);

      userSignal = userOf('ADMIN');
      expect(component.visibleScopes()).toEqual(['USER', 'TEAM', 'SUPERUSER']);
    });
  });

  describe('mandatoryFieldsFilled() (via save gating)', () => {
    beforeEach(() => {
      component.projectId = 1;
      component.formModel.title = 'T';
      component.formModel.description = 'D';
    });

    it('blocks save when a mandatory field has no value', () => {
      component.fields = [field({ id: 10, scope: 'USER', mandatory: true, type: 'TEXT' })];
      component.formModel.values[10] = '';
      expect(component.canSave()).toBe(false);

      component.formModel.values[10] = '   ';
      expect(component.canSave()).toBe(false);

      component.formModel.values[10] = 'value';
      expect(component.canSave()).toBe(true);
    });

    it('treats a mandatory SELECT (single) without value as missing', () => {
      component.fields = [field({ id: 10, scope: 'USER', mandatory: true, type: 'SELECT' })];
      component.formModel.values[10] = '';
      expect(component.canSave()).toBe(false);

      component.formModel.values[10] = 'option';
      expect(component.canSave()).toBe(true);
    });

    it('treats empty array as missing for multi-select', () => {
      component.fields = [field({ id: 10, scope: 'USER', mandatory: true, type: 'SELECT', multiple: true })];
      component.formModel.values[10] = [];
      expect(component.canSave()).toBe(false);

      component.formModel.values[10] = ['option'];
      expect(component.canSave()).toBe(true);
    });

    it('ignores mandatory TEAM-scope fields for non-internal users', () => {
      userSignal = userOf('USER');
      component.fields = [field({ id: 10, scope: 'TEAM', mandatory: true, type: 'TEXT' })];
      component.formModel.values[10] = '';
      expect(component.canSave()).toBe(true);
    });

    it('considers TEAM-scope mandatory fields for internal users', () => {
      userSignal = userOf('TEAM');
      component.fields = [field({ id: 10, scope: 'TEAM', mandatory: true, type: 'TEXT' })];
      component.formModel.values[10] = '';
      expect(component.canSave()).toBe(false);
    });

    it('ignores ATTACHMENTS-type fields', () => {
      component.fields = [field({ id: 10, scope: 'USER', mandatory: true, type: 'ATTACHMENTS' })];
      component.formModel.values[10] = '';
      expect(component.canSave()).toBe(true);
    });
  });

  describe('save()', () => {
    beforeEach(() => {
      component.projectId = 1;
      component.formModel.title = '  Title  ';
      component.formModel.description = '  Desc  ';
      component.fields = [];
    });

    it('does nothing when not canSave', () => {
      component.formModel.title = '';
      component.save();
      expect(segnalazioniApi.creaSegnalazione).not.toHaveBeenCalled();
    });

    it('does nothing when already saving', () => {
      component.saving = true;
      component.save();
      expect(segnalazioniApi.creaSegnalazione).not.toHaveBeenCalled();
    });

    it('creates segnalazione with trimmed title/description', () => {
      component.save();
      expect(segnalazioniApi.creaSegnalazione).toHaveBeenCalled();
      const sent = segnalazioniApi.creaSegnalazione.mock.calls[0][0];
      expect(sent.title).toBe('Title');
      expect(sent.description).toBe('Desc');
      expect(sent.projectId).toBe(1);
      expect(sent.values).toEqual([]);
      expect(sent.internal).toBe(false);
    });

    it('passes internal=true only for internal users with internal checked', () => {
      userSignal = userOf('ADMIN');
      component.formModel.internal = true;
      component.save();
      const sent = segnalazioniApi.creaSegnalazione.mock.calls[0][0];
      expect(sent.internal).toBe(true);
    });

    it('passes internal=false even when checked if user is not internal', () => {
      userSignal = userOf('USER');
      component.formModel.internal = true;
      component.save();
      const sent = segnalazioniApi.creaSegnalazione.mock.calls[0][0];
      expect(sent.internal).toBe(false);
    });

    it('sets error and clears saving on failure', () => {
      component.save();
      segnalazioniApi.creaSegnalazione$.error(new Error('boom'));
      expect(component.error).toBe('Non riesco a creare la segnalazione.');
      expect(component.saving).toBe(false);
    });

    it('emits created and uploads no attachments when none attached', () => {
      const createdSpy = jest.fn();
      component.created.subscribe(createdSpy);
      component.save();
      segnalazioniApi.creaSegnalazione$.next({ id: 99 } as SegnalazioneSummary);
      expect(createdSpy).toHaveBeenCalledWith({ id: 99 });
      expect(segnalazioniApi.uploadAttachment).not.toHaveBeenCalled();
      expect(component.saving).toBe(false);
    });

    it('uploads attachments and emits created on success', () => {
      const file = new File(['a'], 'a.txt');
      component.formModel.attachments[7] = [file];
      const createdSpy = jest.fn();
      component.created.subscribe(createdSpy);

      component.save();
      segnalazioniApi.creaSegnalazione$.next({ id: 99 } as SegnalazioneSummary);
      expect(segnalazioniApi.uploadAttachment).toHaveBeenCalledWith(99, 7, file);

      segnalazioniApi.emitUpload({ id: 1 });
      expect(createdSpy).toHaveBeenCalledWith({ id: 99 });
      expect(component.saving).toBe(false);
    });

    it('shows attachment error but still emits created on partial upload failure', () => {
      const file = new File(['a'], 'a.txt');
      component.formModel.attachments[7] = [file];
      const createdSpy = jest.fn();
      component.created.subscribe(createdSpy);

      component.save();
      segnalazioniApi.creaSegnalazione$.next({ id: 99 } as SegnalazioneSummary);
      segnalazioniApi.uploadAttachment$.error(new Error('upload fail'));

      expect(component.error).toBe('Segnalazione creata, ma non riesco a caricare uno o più allegati.');
      expect(createdSpy).toHaveBeenCalledWith({ id: 99 });
      expect(component.saving).toBe(false);
    });
  });

  describe('schema loading via ngOnChanges', () => {
    it('loads fields and options when projectId is set', () => {
      component.projectId = 1;
      component.ngOnChanges();
      expect(segnalazioniApi.segnalazioneCampi).toHaveBeenCalledWith(1);
      expect(segnalazioniApi.segnalazioneCampoOpzioni).toHaveBeenCalledWith(1);
    });

    it('populates fields and groups options', () => {
      component.projectId = 5;
      component.ngOnChanges();
      const fields: SegnalazioneCampo[] = [
        field({ id: 100, code: 'B', label: 'B' }),
        field({ id: 200, code: 'A', label: 'A' })
      ];
      const options: SegnalazioneCampoOpzione[] = [
        { id: 1, definitionId: 100, projectId: 5, value: 'b1', label: 'B1', active: true },
        { id: 2, definitionId: 100, projectId: 5, value: 'b0', label: 'B0', active: true },
        { id: 3, definitionId: 100, projectId: 5, value: 'inactive', label: 'Inactive', active: false },
        { id: 4, definitionId: 200, projectId: 5, value: 'a1', label: 'A1', active: true }
      ];
      segnalazioniApi.emitFields(fields);
      segnalazioniApi.emitOptions(options);

      expect(component.fields.map(f => f.id)).toEqual([200, 100]); // sorted by code
      expect(component.optionsByField.get(100)!.map(o => o.label)).toEqual(['B0', 'B1']);
      expect(component.optionsByField.get(200)!.map(o => o.label)).toEqual(['A1']);
    });

    it('handles schema load error', () => {
      component.projectId = 5;
      component.ngOnChanges();
      segnalazioniApi.emitFieldsError(new Error('boom'));
      expect(component.error).toBe('Non riesco a caricare i campi del form.');
      expect(component.schemaLoading).toBe(false);
    });
  });
});
