import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { Subject } from 'rxjs';
import { ExternalAuthComponent } from './external-auth.component';
import { AdminConfigService } from '../../../services/config/admin-config/admin-config.service';
import { ExternalAuthConfigService } from '../../../services/config/external-auth/external-auth.service';
import type { AppUser, Project } from '../../../services/config/admin-config/admin-config.service';
import type { ExternalAuthConfig, ExternalJwtSecret } from '../../../services/config/external-auth/external-auth.service';

class AdminConfigStub {
  projects$ = new Subject<Project[]>();
  projects = jest.fn(() => this.projects$.asObservable());
  projectUsers$ = new Subject<AppUser[]>();
  projectUsers = jest.fn(() => this.projectUsers$.asObservable());
  users$ = new Subject<AppUser[]>();
  users = jest.fn(() => this.users$.asObservable());
}

class ExternalAuthStub {
  get$ = new Subject<ExternalAuthConfig>();
  get = jest.fn(() => this.get$.asObservable());
  setEnabled$ = new Subject<ExternalAuthConfig>();
  setEnabled = jest.fn(() => this.setEnabled$.asObservable());
  addSecret$ = new Subject<ExternalAuthConfig>();
  addSecret = jest.fn(() => this.addSecret$.asObservable());
  updateSecret$ = new Subject<ExternalAuthConfig>();
  updateSecret = jest.fn(() => this.updateSecret$.asObservable());
  deleteSecret$ = new Subject<ExternalAuthConfig>();
  deleteSecret = jest.fn(() => this.deleteSecret$.asObservable());
  addMapping$ = new Subject<ExternalAuthConfig>();
  addMapping = jest.fn(() => this.addMapping$.asObservable());
  deleteMapping$ = new Subject<ExternalAuthConfig>();
  deleteMapping = jest.fn(() => this.deleteMapping$.asObservable());
}

function project(partial: Partial<Project>): Project {
  return { id: 1, name: 'P1', companyId: null, archiveAfterDays: null, logoUrl: null, ...partial };
}

function user(partial: Partial<AppUser>): AppUser {
  return { id: 1, username: 'mario', email: 'm@e.com', displayName: 'M', role: 'USER', companyId: null, ...partial };
}

function config(partial: Partial<ExternalAuthConfig>): ExternalAuthConfig {
  return { enabled: false, secrets: [], ...partial };
}

function secret(partial: Partial<ExternalJwtSecret>): ExternalJwtSecret {
  return { id: 1, name: 'App', algorithm: 'HS256', secretBase64: false, mappings: [], ...partial };
}

describe('ExternalAuthComponent', () => {
  let fixture: ComponentFixture<ExternalAuthComponent>;
  let component: ExternalAuthComponent;
  let admin: AdminConfigStub;
  let api: ExternalAuthStub;

  beforeEach(async () => {
    admin = new AdminConfigStub();
    api = new ExternalAuthStub();

    await TestBed.configureTestingModule({
      imports: [ExternalAuthComponent],
      providers: [
        provideAnimationsAsync('noop'),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AdminConfigService, useValue: admin },
        { provide: ExternalAuthConfigService, useValue: api }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(ExternalAuthComponent);
    component = fixture.componentInstance;
  });

  function finishInitialLoad() {
    component.ngOnInit();
    admin.projects$.next([project({ id: 1, name: 'P1' })]);
    admin.projects$.complete();
    admin.projectUsers$.next([]);
    admin.projectUsers$.complete();
    admin.users$.next([]);
    admin.users$.complete();
  }

  describe('ngOnInit / selectProject() / loadProject()', () => {
    it('selects first project and loads config', () => {
      component.ngOnInit();
      admin.projects$.next([project({ id: 5, name: 'P5' })]);
      admin.projects$.complete();
      expect(component.projectId).toBe(5);
      expect(api.get).toHaveBeenCalledWith(5);
    });

    it('sets error on projects load failure', () => {
      component.ngOnInit();
      admin.projects$.error(new Error('boom'));
      expect(component.error).toBe('Impossibile caricare i progetti.');
    });

    it('selectProject(null) does nothing', () => {
      component.selectProject(null);
      expect(api.get).not.toHaveBeenCalled();
    });

    it('loadProject() merges members and ADMIN users', () => {
      finishInitialLoad();
      api.get$.next(config({ enabled: true }));
      api.get$.complete();
      expect(component.config?.enabled).toBe(true);
    });

    it('merges users and admins correctly', () => {
      component.projectId = 1;
      component.loadProject(1);
      admin.projectUsers$.next([
        user({ id: 1, username: 'member1', role: 'TEAM' }),
        user({ id: 2, username: 'member2', role: 'USER' })
      ]);
      admin.projectUsers$.complete();
      admin.users$.next([
        user({ id: 3, username: 'admin1', role: 'ADMIN' }),
        user({ id: 4, username: 'external', role: 'USER' })
      ]);
      admin.users$.complete();
      api.get$.next(config());
      api.get$.complete();
      const usernames = component.users.map(u => u.username);
      expect(usernames).toContain('member1');
      expect(usernames).toContain('member2');
      expect(usernames).toContain('admin1');
      expect(usernames).not.toContain('external');
    });

    it('loadProject() sets error on failure', () => {
      component.projectId = 1;
      component.loadProject(1);
      api.get$.error(new Error('boom'));
      api.get$.complete();
      expect(component.error).toBe('Impossibile caricare la configurazione.');
    });
  });

  describe('setEnabled()', () => {
    beforeEach(() => finishInitialLoad());

    it('calls api.setEnabled with project id and flag', () => {
      component.setEnabled(true);
      expect(api.setEnabled).toHaveBeenCalledWith(1, true);
    });

    it('updates config on success', () => {
      component.setEnabled(true);
      api.setEnabled$.next(config({ enabled: true }));
      api.setEnabled$.complete();
      expect(component.config?.enabled).toBe(true);
      expect(component.saving).toBe(false);
    });

    it('sets error on failure', () => {
      component.setEnabled(true);
      api.setEnabled$.error(new Error('boom'));
      api.setEnabled$.complete();
      expect(component.error).toBe('Operazione non riuscita. Controlla i dati e riprova.');
    });
  });

  describe('saveApplication()', () => {
    beforeEach(() => finishInitialLoad());

    it('noops with empty name', () => {
      component.draft.name = '   ';
      component.draft.secret = 'x';
      component.saveApplication();
      expect(api.addSecret).not.toHaveBeenCalled();
    });

    it('noops without secret when creating', () => {
      component.draft.name = 'App';
      component.draft.secret = '';
      component.saveApplication();
      expect(api.addSecret).not.toHaveBeenCalled();
    });

    it('creates secret', () => {
      component.draft.name = '  NewApp  ';
      component.draft.secret = 'secret123';
      component.draft.algorithm = 'HS384';
      component.saveApplication();
      expect(api.addSecret).toHaveBeenCalledWith(1, expect.objectContaining({ name: 'NewApp', algorithm: 'HS384' }));
      api.addSecret$.next(config({ secrets: [secret({ name: 'NewApp' })] }));
      api.addSecret$.complete();
      expect(component.selectedApplication?.name).toBe('NewApp');
      expect(component.draft.secret).toBe('');
    });

    it('updates secret when editing', () => {
      component.selectedApplication = secret({ id: 5, name: 'Old' });
      component.draft.name = 'Old';
      component.draft.secret = '';
      component.saveApplication();
      expect(api.updateSecret).toHaveBeenCalledWith(1, 5, expect.objectContaining({ name: 'Old' }));
    });

    it('409 sets conflict message', () => {
      component.draft.name = 'App';
      component.draft.secret = 'x';
      component.saveApplication();
      api.addSecret$.error(new HttpErrorResponse({ status: 409 }));
      api.addSecret$.complete();
      expect(component.formError).toBe('Esiste già un’applicazione con questo nome.');
    });

    it('non-409 sets generic message', () => {
      component.draft.name = 'App';
      component.draft.secret = 'x';
      component.saveApplication();
      api.addSecret$.error(new Error('boom'));
      api.addSecret$.complete();
      expect(component.formError).toBe('Impossibile salvare. Verifica algoritmo, formato Base64 e lunghezza del secret.');
    });
  });

  describe('addMapping() / deleteMapping()', () => {
    beforeEach(() => finishInitialLoad());

    it('addMapping() noops with empty subject or userId', () => {
      component.selectedApplication = secret({ id: 5 });
      component.subject = '   ';
      component.userId = null;
      component.addMapping();
      expect(api.addMapping).not.toHaveBeenCalled();
    });

    it('addMapping() calls API and clears inputs', () => {
      component.selectedApplication = secret({ id: 5 });
      component.subject = '  subject1  ';
      component.userId = 7;
      component.addMapping();
      expect(api.addMapping).toHaveBeenCalledWith(1, 5, 'subject1', 7);
      api.addMapping$.next(config({ secrets: [secret({ id: 5, mappings: [{ id: 1, subject: 'subject1', userId: 7 }] })] }));
      api.addMapping$.complete();
      expect(component.subject).toBe('');
      expect(component.userId).toBeNull();
    });

    it('deleteMapping() calls deleteMapping API and syncs', () => {
      component.selectedApplication = secret({ id: 5 });
      component.deleteMapping(99);
      expect(api.deleteMapping).toHaveBeenCalledWith(1, 5, 99);
      api.deleteMapping$.next(config());
      api.deleteMapping$.complete();
    });
  });

  describe('deleteApplication()', () => {
    beforeEach(() => finishInitialLoad());

    it('noops without project or application', () => {
      component.projectId = null;
      component.deleteApplication();
      expect(api.deleteSecret).not.toHaveBeenCalled();
    });

    it('removes application and reloads config', () => {
      component.applicationToDelete = secret({ id: 5 });
      component.selectedApplication = secret({ id: 5 });
      component.applicationVisible = true;
      component.deleteApplication();
      expect(api.deleteSecret).toHaveBeenCalledWith(1, 5);
      expect(api.get).toHaveBeenCalled();
      api.deleteSecret$.next(config());
      api.get$.next(config());
      expect(component.applicationVisible).toBe(false);
      expect(component.applicationToDelete).toBeNull();
    });

    it('sets deleteError on failure', () => {
      component.applicationToDelete = secret({ id: 5 });
      component.deleteApplication();
      api.deleteSecret$.error(new Error('boom'));
      api.deleteSecret$.complete();
      expect(component.deleteError).toBe('Impossibile eliminare l’applicazione. Riprova.');
    });
  });
});