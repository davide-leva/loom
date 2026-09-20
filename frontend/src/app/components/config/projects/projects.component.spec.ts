import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Subject } from 'rxjs';
import { ProjectsComponent } from './projects.component';
import { AdminConfigService } from '../../../services/config/admin-config/admin-config.service';
import { ProjectContextService } from '../../../services/project-context/project-context.service';
import type { AppUser, Company, Project, ProjectInput } from '../../../services/config/admin-config/admin-config.service';

class AdminConfigStub {
  projects$ = new Subject<Project[]>();
  projects = jest.fn(() => this.projects$.asObservable());
  companies$ = new Subject<Company[]>();
  companies = jest.fn(() => this.companies$.asObservable());
  users$ = new Subject<AppUser[]>();
  users = jest.fn(() => this.users$.asObservable());
  projectUsers$ = new Subject<AppUser[]>();
  projectUsers = jest.fn(() => this.projectUsers$.asObservable());
  createProject$ = new Subject<Project>();
  createProject = jest.fn(() => this.createProject$.asObservable());
  updateProject$ = new Subject<Project>();
  updateProject = jest.fn(() => this.updateProject$.asObservable());
  updateProjectArchiveAfterDays$ = new Subject<Project>();
  updateProjectArchiveAfterDays = jest.fn(() => this.updateProjectArchiveAfterDays$.asObservable());
  deleteProject$ = new Subject<void>();
  deleteProject = jest.fn(() => this.deleteProject$.asObservable());
  deleteProjectLogo$ = new Subject<void>();
  deleteProjectLogo = jest.fn(() => this.deleteProjectLogo$.asObservable());
  assignProjectUser$ = new Subject<void>();
  assignProjectUser = jest.fn(() => this.assignProjectUser$.asObservable());
  removeProjectUser$ = new Subject<void>();
  removeProjectUser = jest.fn(() => this.removeProjectUser$.asObservable());
}

function project(partial: Partial<Project>): Project {
  return {
    id: 1, name: 'P1', companyId: null, archiveAfterDays: null, logoUrl: null,
    ...partial
  } as Project;
}

function company(partial: Partial<Company>): Company {
  return { id: 1, name: 'Acme', logoUrl: null, primaryColor: 'blue', ...partial };
}

function user(partial: Partial<AppUser>): AppUser {
  return {
    id: 1, username: 'mario', email: 'm@e.com', displayName: 'Mario',
    role: 'USER', companyId: null,
    ...partial
  } as AppUser;
}

describe('ProjectsComponent', () => {
  let fixture: ComponentFixture<ProjectsComponent>;
  let component: ProjectsComponent;
  let api: AdminConfigStub;
  let ctx: { load: jest.Mock };

  beforeEach(async () => {
    api = new AdminConfigStub();
    ctx = { load: jest.fn() };

    await TestBed.configureTestingModule({
      imports: [ProjectsComponent],
      providers: [
        provideAnimationsAsync('noop'),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AdminConfigService, useValue: api },
        { provide: ProjectContextService, useValue: ctx }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(ProjectsComponent);
    component = fixture.componentInstance;
  });

  function finishInitialLoad() {
    component.ngOnInit();
    api.projects$.next([]);
    api.projects$.complete();
    api.companies$.next([]);
    api.companies$.complete();
    api.users$.next([]);
    api.users$.complete();
  }

  describe('load() and rows', () => {
    it('builds rows from projects + companies, sorts companies by name', () => {
      component.load();
      api.projects$.next([
        project({ id: 1, name: 'B', companyId: 1 }),
        project({ id: 2, name: 'A', companyId: null }),
        project({ id: 3, name: 'C', companyId: 1 })
      ]);
      api.projects$.complete();
      api.companies$.next([company({ id: 1, name: 'Bravo' }), company({ id: 2, name: 'Alpha' })]);
      api.companies$.complete();
      api.users$.next([]);
      api.users$.complete();
      expect(component.companies.map(c => c.name)).toEqual(['Alpha', 'Bravo']);
      // rows sorted by project name
      expect(component.rows.map(r => r.id)).toEqual([2, 1, 3]);
      // companyName mapped
      expect(component.rows.find(r => r.id === 1)?.companyName).toBe('Bravo');
      expect(component.rows.find(r => r.id === 2)?.companyName).toBe('Nessuna compagnia');
    });

    it('sets loadError on failure', () => {
      component.load();
      api.projects$.error(new Error('boom'));
      expect(component.loadError).toBe('Impossibile caricare i progetti. Riprova.');
    });
  });

  describe('openCreate / openEdit', () => {
    it('openCreate() resets draft and shows form', () => {
      finishInitialLoad();
      component.openCreate();
      expect(component.formVisible).toBe(true);
      expect(component.editingProject).toBeNull();
      expect(component.draft.name).toBe('');
    });

    it('openEdit() copies current values and loads members', () => {
      finishInitialLoad();
      component.projects = [project({ id: 5, name: 'X', companyId: 1, archiveAfterDays: 30 })];
      component.openEdit({ id: 5, name: 'X', companyId: 1, companyName: 'X', archiveAfterDays: 30, logoUrl: null });
      expect(component.draft.name).toBe('X');
      expect(component.draft.companyId).toBe(1);
      expect(component.draft.archiveAfterDays).toBe(30);
      expect(api.projectUsers).toHaveBeenCalledWith(5);
    });

    it('openEdit() ignores unknown row', () => {
      finishInitialLoad();
      component.openEdit({ id: 99 } as any);
      expect(component.formVisible).toBe(false);
    });
  });

  describe('externalUserOptions and isAutomaticMember', () => {
    beforeEach(() => {
      finishInitialLoad();
      component.companies = [company({ id: 1, name: 'Acme' })];
      component.allUsers = [
        user({ id: 1, username: 'mario', companyId: 1 }),
        user({ id: 2, username: 'giulia', companyId: 1 }),
        user({ id: 3, username: 'anna', companyId: 2 }),
        user({ id: 4, username: 'luigi', companyId: null })
      ];
      component.members = [user({ id: 2, username: 'giulia', companyId: 1 })];
      component.editingProject = project({ id: 10, name: 'P', companyId: 1 });
    });

    it('excludes members and users of the same company', () => {
      const opts = component.externalUserOptions;
      const values = opts.map(o => o.value);
      expect(values).toContain(3); // anna (different company)
      expect(values).toContain(4); // luigi (internal)
      expect(values).not.toContain(1); // mario: same company as project
      expect(values).not.toContain(2); // giulia: already member
    });

    it('lists all users when project has no company', () => {
      component.editingProject = project({ id: 10, name: 'P', companyId: null });
      const values = component.externalUserOptions.map(o => o.value);
      // giulia is a member so excluded; mario/anna/luigi listed (no company match)
      expect(values).toEqual(expect.arrayContaining([1, 3, 4]));
      expect(values).not.toContain(2);
    });

    it('returns [] when editingProject is null', () => {
      component.editingProject = null;
      expect(component.externalUserOptions).toEqual([]);
    });

    it('isAutomaticMember() true only when same company', () => {
      expect(component.isAutomaticMember(user({ companyId: 1 }))).toBe(true);
      expect(component.isAutomaticMember(user({ companyId: 2 }))).toBe(false);
      expect(component.isAutomaticMember(user({ companyId: null }))).toBe(false);
      component.editingProject = null;
      expect(component.isAutomaticMember(user({ companyId: 1 }))).toBe(false);
    });
  });

  describe('onArchiveDaysChange() / persistArchiveDays()', () => {
    beforeEach(() => finishInitialLoad());

    it('onArchiveDaysChange() marks dirty and updates draft', () => {
      component.editingProject = project({ id: 1, name: 'X', companyId: null, archiveAfterDays: 30 });
      component.draft.archiveAfterDays = 30;
      component.onArchiveDaysChange(45);
      expect(component.draft.archiveAfterDays).toBe(45);
      expect(component.archiveDirty).toBe(true);
    });

    it('persistArchiveDays() noop when not editing or not dirty', () => {
      component.persistArchiveDays();
      expect(api.updateProjectArchiveAfterDays).not.toHaveBeenCalled();
    });

    it('persistArchiveDays() calls API and updates project on success', () => {
      component.editingProject = project({ id: 1, name: 'X', companyId: null, archiveAfterDays: 30 });
      component.draft.archiveAfterDays = 45;
      component.archiveDirty = true;
      component.projects = [component.editingProject];
      component.persistArchiveDays();
      expect(api.updateProjectArchiveAfterDays).toHaveBeenCalledWith(1, 45);
      api.updateProjectArchiveAfterDays$.next(project({ id: 1, name: 'X', companyId: null, archiveAfterDays: 45 }));
      api.updateProjectArchiveAfterDays$.complete();
      expect(component.editingProject!.archiveAfterDays).toBe(45);
      expect(component.archiveDirty).toBe(false);
      expect(component.saving).toBe(false);
    });

    it('persistArchiveDays() sets error on failure', () => {
      component.editingProject = project({ id: 1 });
      component.draft.archiveAfterDays = 45;
      component.archiveDirty = true;
      component.persistArchiveDays();
      api.updateProjectArchiveAfterDays$.error(new Error('boom'));
      expect(component.saveError).toBe('Impossibile salvare i parametri di archiviazione. Riprova.');
    });
  });

  describe('removeLogo()', () => {
    beforeEach(() => finishInitialLoad());

    it('noops when no editing project or no logo', () => {
      component.removeLogo();
      expect(api.deleteProjectLogo).not.toHaveBeenCalled();
    });

    it('removes logo on success and refreshes project context', () => {
      component.editingProject = project({ id: 5, name: 'X', logoUrl: 'http://logo' });
      component.projects = [component.editingProject];
      component.removeLogo();
      expect(api.deleteProjectLogo).toHaveBeenCalledWith(5);
      api.deleteProjectLogo$.next();
      expect(component.editingProject!.logoUrl).toBeNull();
      expect(ctx.load).toHaveBeenCalled();
    });

    it('sets error on failure', () => {
      component.editingProject = project({ id: 5, logoUrl: 'http://logo' });
      component.removeLogo();
      api.deleteProjectLogo$.error(new Error('boom'));
      expect(component.saveError).toBe('Impossibile rimuovere il logo.');
    });
  });

  describe('save()', () => {
    beforeEach(() => finishInitialLoad());

    it('noops with empty name', () => {
      component.draft.name = '   ';
      component.save();
      expect(api.createProject).not.toHaveBeenCalled();
    });

    it('noops when name too long', () => {
      component.draft.name = 'a'.repeat(33);
      component.save();
      expect(api.createProject).not.toHaveBeenCalled();
    });

    it('create: calls createProject and appends to list', () => {
      component.draft.name = '  NewP  ';
      component.draft.companyId = 1;
      component.draft.archiveAfterDays = 60;
      component.save();
      const sent = api.createProject.mock.calls[0][0] as ProjectInput;
      expect(sent.name).toBe('NewP');
      expect(sent.companyId).toBe(1);
      api.createProject$.next(project({ id: 99, name: 'NewP', companyId: 1, archiveAfterDays: 60 }));
      expect(component.projects.some(p => p.id === 99)).toBe(true);
      expect(component.formVisible).toBe(false);
      expect(ctx.load).toHaveBeenCalled();
    });

    it('update: calls updateProject and reloads members', () => {
      component.editingProject = project({ id: 5, name: 'X' });
      component.projects = [component.editingProject];
      component.draft.name = 'Y';
      component.draft.companyId = 2;
      component.save();
      expect(api.updateProject).toHaveBeenCalledWith(5, expect.objectContaining({ name: 'Y', companyId: 2 }), null);
      api.updateProject$.next(project({ id: 5, name: 'Y', companyId: 2 }));
      expect(component.projects[0].name).toBe('Y');
      expect(component.editingProject!.name).toBe('Y');
      expect(api.projectUsers).toHaveBeenCalledWith(5);
    });

    it('sets saveError on failure', () => {
      component.draft.name = 'X';
      component.save();
      api.createProject$.error(new Error('boom'));
      expect(component.saveError).toBe('Impossibile salvare il progetto. Riprova.');
      expect(component.saving).toBe(false);
    });
  });

  describe('assignExternalUser() / removeExplicitUser()', () => {
    beforeEach(() => {
      finishInitialLoad();
      component.editingProject = project({ id: 5, name: 'P', companyId: 1 });
      component.members = [];
    });

    it('assignExternalUser() noops without selection', () => {
      component.selectedExternalUserId = null;
      component.assignExternalUser();
      expect(api.assignProjectUser).not.toHaveBeenCalled();
    });

    it('assignExternalUser() calls API and reloads members', () => {
      component.selectedExternalUserId = 7;
      component.assignExternalUser();
      expect(api.assignProjectUser).toHaveBeenCalledWith(5, 7);
      api.assignProjectUser$.next();
      expect(api.projectUsers).toHaveBeenCalledWith(5);
    });

    it('assignExternalUser() sets error on failure', () => {
      component.selectedExternalUserId = 7;
      component.assignExternalUser();
      api.assignProjectUser$.error(new Error('boom'));
      expect(component.assignError).toContain('Impossibile assegnare');
    });

    it('removeExplicitUser() skips automatic members', () => {
      component.removeExplicitUser(user({ id: 1, companyId: 1 }));
      expect(api.removeProjectUser).not.toHaveBeenCalled();
    });

    it('removeExplicitUser() calls API for explicit members', () => {
      component.removeExplicitUser(user({ id: 4, companyId: null }));
      expect(api.removeProjectUser).toHaveBeenCalledWith(5, 4);
    });
  });

  describe('delete()', () => {
    beforeEach(() => finishInitialLoad());

    it('confirmDelete() opens dialog only for known project', () => {
      component.projects = [project({ id: 5, name: 'P' })];
      component.confirmDelete({ id: 5 } as any);
      expect(component.deleteVisible).toBe(true);
      expect(component.projectToDelete?.id).toBe(5);
      component.confirmDelete({ id: 99 } as any);
      expect(component.deleteVisible).toBe(true); // unchanged
    });

    it('delete() removes project on success and refreshes context', () => {
      component.projectToDelete = project({ id: 5, name: 'P' });
      component.projects = [component.projectToDelete];
      component.delete();
      expect(api.deleteProject).toHaveBeenCalledWith(5);
      api.deleteProject$.next();
      expect(component.projects.length).toBe(0);
      expect(component.deleteVisible).toBe(false);
      expect(ctx.load).toHaveBeenCalled();
    });

    it('delete() sets error on failure', () => {
      component.projectToDelete = project({ id: 5 });
      component.delete();
      api.deleteProject$.error(new Error('boom'));
      expect(component.deleteError).toContain('Impossibile eliminare');
    });
  });
});