import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { Subject } from 'rxjs';
import { TeamUsersComponent } from './team-users.component';
import { AdminConfigService } from '../../../services/config/admin-config/admin-config.service';
import type { TeamUser } from '../../../services/config/admin-config/admin-config.service';

class AdminConfigStub {
  users$ = new Subject<TeamUser[]>();
  users = jest.fn(() => this.users$.asObservable());
  createTeamUser$ = new Subject<TeamUser>();
  createTeamUser = jest.fn(() => this.createTeamUser$.asObservable());
  updateTeamUser$ = new Subject<TeamUser>();
  updateTeamUser = jest.fn(() => this.updateTeamUser$.asObservable());
  deleteUser$ = new Subject<void>();
  deleteUser = jest.fn(() => this.deleteUser$.asObservable());
}

function user(partial: Partial<TeamUser>): TeamUser {
  return {
    id: 1, username: 'mario', email: 'm@e.com', firstName: null, lastName: null,
    role: 'TEAM', companyId: null, wantEmail: null,
    ...partial
  } as TeamUser;
}

describe('TeamUsersComponent', () => {
  let fixture: ComponentFixture<TeamUsersComponent>;
  let component: TeamUsersComponent;
  let api: AdminConfigStub;

  beforeEach(async () => {
    api = new AdminConfigStub();
    await TestBed.configureTestingModule({
      imports: [TeamUsersComponent],
      providers: [
        provideAnimationsAsync('noop'),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AdminConfigService, useValue: api }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(TeamUsersComponent);
    component = fixture.componentInstance;
  });

  function finishInitialLoad() {
    component.ngOnInit();
    api.users$.next([]);
    api.users$.complete();
  }

  describe('load()', () => {
    it('filters out non-team/admin users and sorts', () => {
      component.load();
      api.users$.next([
        user({ id: 1, username: 'bravo', role: 'TEAM' }),
        user({ id: 2, username: 'mario', role: 'TEAM' }),
        user({ id: 3, username: 'client', role: 'USER' }),
        user({ id: 4, username: 'anna', role: 'ADMIN' })
      ]);
      api.users$.complete();
      expect(component.users.map(u => u.username)).toEqual(['anna', 'bravo', 'mario']);
    });

    it('sets loadError on failure', () => {
      component.load();
      api.users$.error(new Error('boom'));
      expect(component.loadError).toBe('Impossibile caricare gli utenti del team. Riprova.');
    });
  });

  describe('showNewUser / editUser', () => {
    beforeEach(() => finishInitialLoad());

    it('showNewUser resets draft', () => {
      component.showNewUser();
      expect(component.editingUser).toBeNull();
      expect(component.formVisible).toBe(true);
      expect(component.draft.username).toBe('');
    });

    it('editUser copies current values', () => {
      const existing = user({ id: 1, username: 'mario', email: 'm@e.com', firstName: 'Mario' });
      component.editUser(existing);
      expect(component.draft.username).toBe('mario');
      expect(component.draft.email).toBe('m@e.com');
      expect(component.draft.firstName).toBe('Mario');
      expect(component.draft.password).toBe('');
    });
  });

  describe('saveUser()', () => {
    beforeEach(() => finishInitialLoad());

    it('does nothing when saving', () => {
      component.saving = true;
      component.saveUser();
      expect(api.createTeamUser).not.toHaveBeenCalled();
    });

    it('requires username and email', () => {
      component.draft.username = '';
      component.draft.email = 'a@b.com';
      component.saveUser();
      expect(api.createTeamUser).not.toHaveBeenCalled();
    });

    it('requires password (>=8) for new user', () => {
      component.draft.username = 'mario';
      component.draft.email = 'm@e.com';
      component.draft.password = 'short';
      component.saveUser();
      expect(api.createTeamUser).not.toHaveBeenCalled();
    });

    it('rejects too-short password when editing', () => {
      component.editingUser = user({ id: 1 });
      component.draft.username = 'mario';
      component.draft.email = 'm@e.com';
      component.draft.password = 'short';
      component.saveUser();
      expect(api.updateTeamUser).not.toHaveBeenCalled();
    });

    it('creates new user with trimmed fields', () => {
      component.draft.username = '  mario  ';
      component.draft.email = 'm@e.com';
      component.draft.password = 'secret123';
      component.draft.firstName = ' Mario ';
      component.saveUser();
      expect(api.createTeamUser).toHaveBeenCalled();
      const sent = api.createTeamUser.mock.calls[0][0];
      expect(sent.username).toBe('mario');
      expect(sent.email).toBe('m@e.com');
      expect(sent.firstName).toBe('Mario');
      expect(sent.companyId).toBeNull();
    });

    it('editing without new password omits password', () => {
      component.editingUser = user({ id: 1 });
      component.draft.username = 'mario';
      component.draft.email = 'm@e.com';
      component.saveUser();
      expect(api.updateTeamUser).toHaveBeenCalled();
      const sent = api.updateTeamUser.mock.calls[0][1];
      expect(sent.password).toBeNull();
    });

    it('409 sets conflict message', () => {
      component.draft.username = 'mario';
      component.draft.email = 'm@e.com';
      component.draft.password = 'secret123';
      component.saveUser();
      api.createTeamUser$.error(new HttpErrorResponse({ status: 409 }));
      api.createTeamUser$.complete();
      expect(component.saveError).toBe('Username o email già in uso.');
    });

    it('non-409 sets generic message', () => {
      component.draft.username = 'mario';
      component.draft.email = 'm@e.com';
      component.draft.password = 'secret123';
      component.saveUser();
      api.createTeamUser$.error(new Error('boom'));
      api.createTeamUser$.complete();
      expect(component.saveError).toBe('Impossibile salvare l’utente. Controlla i dati e riprova.');
    });

    it('appends new user on success', () => {
      component.users = [];
      component.draft.username = 'mario';
      component.draft.email = 'm@e.com';
      component.draft.password = 'secret123';
      component.saveUser();
      api.createTeamUser$.next(user({ id: 5, username: 'mario' }));
      api.createTeamUser$.complete();
      expect(component.users.length).toBe(1);
      expect(component.formVisible).toBe(false);
      expect(component.saving).toBe(false);
    });

    it('replaces existing user when editing', () => {
      component.users = [user({ id: 1, username: 'old' })];
      component.editingUser = user({ id: 1, username: 'old' });
      component.draft.username = 'new';
      component.draft.email = 'n@e.com';
      component.saveUser();
      api.updateTeamUser$.next(user({ id: 1, username: 'new' }));
      api.updateTeamUser$.complete();
      expect(component.users[0].username).toBe('new');
      expect(component.formVisible).toBe(false);
    });
  });

  describe('deleteUser()', () => {
    beforeEach(() => finishInitialLoad());

    it('removes user and refreshes form', () => {
      component.users = [user({ id: 1, username: 'mario' })];
      component.userToDelete = user({ id: 1 });
      component.deleteUser();
      expect(api.deleteUser).toHaveBeenCalledWith(1);
      api.deleteUser$.next();
      api.deleteUser$.complete();
      expect(component.users.length).toBe(0);
      expect(component.deleteVisible).toBe(false);
    });

    it('closes edit form if editing the deleted user', () => {
      component.users = [user({ id: 1 })];
      component.editingUser = user({ id: 1 });
      component.formVisible = true;
      component.userToDelete = user({ id: 1 });
      component.deleteUser();
      api.deleteUser$.next();
      expect(component.formVisible).toBe(false);
      expect(component.editingUser).toBeNull();
    });

    it('sets deleteError on failure', () => {
      component.userToDelete = user({ id: 1 });
      component.deleteUser();
      api.deleteUser$.error(new Error('boom'));
      api.deleteUser$.complete();
      expect(component.deleteError).toBe('Impossibile eliminare l’utente. Riprova.');
    });
  });
});