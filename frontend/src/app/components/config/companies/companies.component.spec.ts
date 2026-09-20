import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { Subject } from 'rxjs';
import { CompaniesComponent } from './companies.component';
import { AdminConfigService } from '../../../services/config/admin-config/admin-config.service';
import { ProjectContextService } from '../../../services/project-context/project-context.service';
import { AuthService } from '../../../services/auth/auth.service';
import type { Company, CompanyUser } from '../../../services/config/admin-config/admin-config.service';

class AdminConfigStub {
  companies$ = new Subject<Company[]>();
  companies = jest.fn(() => this.companies$.asObservable());
  createCompany$ = new Subject<Company>();
  createCompany = jest.fn(() => this.createCompany$.asObservable());
  updateCompany$ = new Subject<Company>();
  updateCompany = jest.fn(() => this.updateCompany$.asObservable());
  deleteCompanyLogo$ = new Subject<void>();
  deleteCompanyLogo = jest.fn(() => this.deleteCompanyLogo$.asObservable());
  companyUsers$ = new Subject<CompanyUser[]>();
  companyUsers = jest.fn(() => this.companyUsers$.asObservable());
  createCompanyUser$ = new Subject<CompanyUser>();
  createCompanyUser = jest.fn(() => this.createCompanyUser$.asObservable());
  updateCompanyUser$ = new Subject<CompanyUser>();
  updateCompanyUser = jest.fn(() => this.updateCompanyUser$.asObservable());
  deleteCompanyUser$ = new Subject<void>();
  deleteCompanyUser = jest.fn(() => this.deleteCompanyUser$.asObservable());
}

function company(partial: Partial<Company>): Company {
  return {
    id: 1, name: 'Acme', primaryColor: 'blue', logoUrl: null, teamCompany: false,
    ...partial
  } as Company;
}

function user(partial: Partial<CompanyUser>): CompanyUser {
  return {
    id: 1, username: 'mario', email: 'm@e.com', firstName: null, lastName: null,
    role: 'USER', companyId: 1, wantEmail: null,
    ...partial
  } as CompanyUser;
}

describe('CompaniesComponent', () => {
  let fixture: ComponentFixture<CompaniesComponent>;
  let component: CompaniesComponent;
  let api: AdminConfigStub;
  let ctx: { load: jest.Mock };
  let auth: { me: jest.Mock };

  beforeEach(async () => {
    api = new AdminConfigStub();
    ctx = { load: jest.fn() };
    auth = { me: jest.fn(() => new Subject<void>().asObservable()) };

    await TestBed.configureTestingModule({
      imports: [CompaniesComponent],
      providers: [
        provideAnimationsAsync('noop'),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AdminConfigService, useValue: api },
        { provide: ProjectContextService, useValue: ctx },
        { provide: AuthService, useValue: auth }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(CompaniesComponent);
    component = fixture.componentInstance;
  });

  function finishInitialLoad() {
    component.ngOnInit();
    api.companies$.next([]);
    api.companies$.complete();
  }

  describe('loadCompanies()', () => {
    it('sorts companies and annotates kindLabel', () => {
      component.loadCompanies();
      api.companies$.next([
        company({ id: 1, name: 'Bravo', teamCompany: true }),
        company({ id: 2, name: 'Alpha' })
      ]);
      api.companies$.complete();
      expect(component.companies.map(c => c.id)).toEqual([2, 1]);
      expect(component.companies[0].kindLabel).toBe('Cliente');
      expect(component.companies[1].kindLabel).toBe('Team interno');
    });

    it('sets companiesError on failure', () => {
      component.loadCompanies();
      api.companies$.error(new Error('boom'));
      expect(component.companiesError).toBe('Impossibile caricare le compagnie. Riprova.');
    });
  });

  describe('createCompany()', () => {
    it('noops with empty name', () => {
      component.newCompanyName = '  ';
      component.createCompany();
      expect(api.createCompany).not.toHaveBeenCalled();
    });

    it('noops with name too long', () => {
      component.newCompanyName = 'x'.repeat(65);
      component.createCompany();
      expect(api.createCompany).not.toHaveBeenCalled();
    });

    it('creates and opens the new company', () => {
      component.newCompanyName = '  NewCo  ';
      component.newCompanyColor = 'red';
      component.createCompany();
      expect(api.createCompany).toHaveBeenCalledWith('NewCo', 'red', null);
      api.createCompany$.next(company({ id: 99, name: 'NewCo' }));
      expect(component.companies.some(c => c.id === 99)).toBe(true);
      expect(component.createCompanyVisible).toBe(false);
      expect(component.selectedCompany?.id).toBe(99);
    });

    it('sets error on failure', () => {
      component.newCompanyName = 'X';
      component.createCompany();
      api.createCompany$.error(new Error('boom'));
      expect(component.companySaveError).toBe('Impossibile creare la compagnia. Riprova.');
      expect(component.savingCompany).toBe(false);
    });
  });

  describe('saveCompanyDetails()', () => {
    beforeEach(() => finishInitialLoad());

    it('noops without selected company', () => {
      component.saveCompanyDetails();
      expect(api.updateCompany).not.toHaveBeenCalled();
    });

    it('noops with empty name', () => {
      component.selectedCompany = company({ id: 1 });
      component.companyName = '   ';
      component.saveCompanyDetails();
      expect(api.updateCompany).not.toHaveBeenCalled();
    });

    it('updates company and refreshes user', () => {
      component.selectedCompany = company({ id: 1, name: 'Old' });
      component.companies = [component.selectedCompany];
      component.companyName = '  New  ';
      component.companyColor = 'green';
      component.saveCompanyDetails();
      expect(api.updateCompany).toHaveBeenCalledWith(1, 'New', 'green', null);
      api.updateCompany$.next(company({ id: 1, name: 'New', primaryColor: 'green' }));
      api.updateCompany$.complete();
      expect(component.selectedCompany!.name).toBe('New');
      expect(auth.me).toHaveBeenCalled();
      expect(component.companyLogo).toBeNull();
      expect(component.savingCompanyDetails).toBe(false);
    });

    it('sets error on failure', () => {
      component.selectedCompany = company({ id: 1 });
      component.companyName = 'X';
      component.saveCompanyDetails();
      api.updateCompany$.error(new Error('boom'));
      expect(component.companyDetailsError).toBe('Impossibile salvare la compagnia. Verifica il logo e riprova.');
    });
  });

  describe('removeCompanyLogo()', () => {
    beforeEach(() => finishInitialLoad());

    it('removes logo and clears URL', () => {
      component.selectedCompany = company({ id: 1, logoUrl: 'http://logo' });
      component.companies = [component.selectedCompany];
      component.removeCompanyLogo();
      expect(api.deleteCompanyLogo).toHaveBeenCalledWith(1);
      api.deleteCompanyLogo$.next();
      expect(component.selectedCompany!.logoUrl).toBeNull();
      expect(auth.me).toHaveBeenCalled();
    });

    it('sets error on failure', () => {
      component.selectedCompany = company({ id: 1, logoUrl: 'http://logo' });
      component.removeCompanyLogo();
      api.deleteCompanyLogo$.error(new Error('boom'));
      expect(component.companyDetailsError).toBe('Impossibile rimuovere il logo.');
    });
  });

  describe('saveUser()', () => {
    beforeEach(() => {
      finishInitialLoad();
      component.selectedCompany = company({ id: 5, name: 'X' });
    });

    it('requires username and email', () => {
      component.newUser.username = '  ';
      component.newUser.email = 'a@b.com';
      component.saveUser();
      expect(api.createCompanyUser).not.toHaveBeenCalled();
    });

    it('requires password (>=8) for new user', () => {
      component.newUser.username = 'mario';
      component.newUser.email = 'm@e.com';
      component.newUser.password = 'short';
      component.saveUser();
      expect(api.createCompanyUser).not.toHaveBeenCalled();
    });

    it('creates new user with trimmed values', () => {
      component.newUser.username = '  mario  ';
      component.newUser.email = 'm@e.com';
      component.newUser.password = 'secret123';
      component.newUser.firstName = ' Mario ';
      component.saveUser();
      expect(api.createCompanyUser).toHaveBeenCalled();
      const sent = api.createCompanyUser.mock.calls[0][0];
      expect(sent.username).toBe('mario');
      expect(sent.email).toBe('m@e.com');
      expect(sent.firstName).toBe('Mario');
      expect(sent.password).toBe('secret123');
      expect(sent.companyId).toBe(5);
    });

    it('editing without new password omits password', () => {
      component.editingUser = user({ id: 1 });
      component.newUser.username = 'mario';
      component.newUser.email = 'm@e.com';
      component.newUser.password = '';
      component.saveUser();
      expect(api.updateCompanyUser).toHaveBeenCalled();
      const sent = api.updateCompanyUser.mock.calls[0][1];
      expect(sent.password).toBeNull();
    });

    it('editing with new password sends it', () => {
      component.editingUser = user({ id: 1 });
      component.newUser.username = 'mario';
      component.newUser.email = 'm@e.com';
      component.newUser.password = 'newpass1';
      component.saveUser();
      expect(sent(api.updateCompanyUser, 'password')).toBe('newpass1');
    });

    it('409 sets conflict message', () => {
      component.newUser.username = 'mario';
      component.newUser.email = 'm@e.com';
      component.newUser.password = 'secret123';
      component.saveUser();
      api.createCompanyUser$.error(new HttpErrorResponse({ status: 409 }));
      expect(component.userSaveError).toBe('Username o email già in uso.');
    });

    it('non-409 sets generic message', () => {
      component.newUser.username = 'mario';
      component.newUser.email = 'm@e.com';
      component.newUser.password = 'secret123';
      component.saveUser();
      api.createCompanyUser$.error(new Error('boom'));
      api.createCompanyUser$.complete();
      expect(component.userSaveError).toBe('Impossibile salvare l’utente. Controlla i dati e riprova.');
    });
  });

  describe('deleteUser()', () => {
    beforeEach(() => finishInitialLoad());

    it('removes the user from the list and reloads project context', () => {
      component.selectedCompany = company({ id: 5 });
      component.companyUsers = [user({ id: 7 }), user({ id: 8 })];
      component.userToDelete = user({ id: 7, companyId: 5 });
      component.deleteUser();
      expect(api.deleteCompanyUser).toHaveBeenCalledWith(7);
      api.deleteCompanyUser$.next();
      expect(component.companyUsers.map(u => u.id)).toEqual([8]);
      expect(component.deleteUserVisible).toBe(false);
      expect(ctx.load).toHaveBeenCalled();
    });

    it('closes edit form when deleting the user being edited', () => {
      component.selectedCompany = company({ id: 5 });
      component.editingUser = user({ id: 7, companyId: 5 });
      component.userFormVisible = true;
      component.companyUsers = [user({ id: 7, companyId: 5 })];
      component.userToDelete = user({ id: 7, companyId: 5 });
      component.deleteUser();
      api.deleteCompanyUser$.next();
      expect(component.userFormVisible).toBe(false);
      expect(component.editingUser).toBeNull();
    });

    it('sets error on failure', () => {
      component.selectedCompany = company({ id: 5 });
      component.userToDelete = user({ id: 7, companyId: 5 });
      component.deleteUser();
      api.deleteCompanyUser$.error(new Error('boom'));
      expect(component.deleteUserError).toBe('Impossibile eliminare l’utente. Riprova.');
    });
  });
});

function sent(mock: jest.Mock, field: string): any {
  return mock.mock.calls[0][1][field];
}