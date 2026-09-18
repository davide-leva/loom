import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { SelectModule } from 'primeng/select';
import { finalize } from 'rxjs';
import { ProjectContextService } from '../project-context.service';
import { AdminConfigService, Company, CompanyRole, CompanyUser, CompanyUserInput } from './admin-config.service';
import { EntityColumn, EntityTableComponent } from './entity-table.component';

type UserDraft = Omit<CompanyUserInput, 'companyId' | 'password'> & { password: string };

@Component({
  selector: 'app-companies',
  imports: [FormsModule, ButtonModule, CardModule, DialogModule, InputTextModule,
    PasswordModule, SelectModule, EntityTableComponent],
  templateUrl: './companies.component.html',
  styleUrl: './companies.component.css'
})
export class CompaniesComponent implements OnInit {
  private readonly api = inject(AdminConfigService);
  private readonly projectContext = inject(ProjectContextService);

  readonly companyColumns: EntityColumn[] = [
    { field: 'id', label: 'ID' },
    { field: 'name', label: 'Compagnia' },
    { field: 'kindLabel', label: 'Tipo' }
  ];
  readonly userColumns: EntityColumn[] = [
    { field: 'username', label: 'Username' },
    { field: 'firstName', label: 'Nome' },
    { field: 'lastName', label: 'Cognome' },
    { field: 'email', label: 'Email' },
    { field: 'role', label: 'Ruolo' }
  ];
  readonly roleOptions: { label: string; value: CompanyRole }[] = [
    { label: 'User', value: 'USER' },
    { label: 'Superuser', value: 'SUPERUSER' }
  ];

  companies: Company[] = [];
  companiesLoading = false;
  companiesError = '';
  createCompanyVisible = false;
  newCompanyName = '';
  companySaveError = '';
  savingCompany = false;

  selectedCompany: Company | null = null;
  companyDialogVisible = false;
  companyUsers: CompanyUser[] = [];
  usersLoading = false;
  usersError = '';
  userFormVisible = false;
  editingUser: CompanyUser | null = null;
  userSaveError = '';
  savingUser = false;
  newUser: UserDraft = this.emptyUser();
  deleteUserVisible = false;
  userToDelete: CompanyUser | null = null;
  deleteUserError = '';
  deletingUser = false;

  ngOnInit(): void {
    this.loadCompanies();
  }

  loadCompanies(): void {
    this.companiesLoading = true;
    this.companiesError = '';
    this.api.companies().pipe(finalize(() => this.companiesLoading = false)).subscribe({
      next: companies => this.companies = this.sortCompanies(companies).map(company => ({ ...company, kindLabel: company.teamCompany ? 'Team interno' : 'Cliente' }) as Company),
      error: () => this.companiesError = 'Impossibile caricare le compagnie. Riprova.'
    });
  }

  openCreateCompany(): void {
    this.newCompanyName = '';
    this.companySaveError = '';
    this.createCompanyVisible = true;
  }

  createCompany(): void {
    const name = this.newCompanyName.trim();
    if (!name || name.length > 64 || this.savingCompany) return;

    this.savingCompany = true;
    this.companySaveError = '';
    this.api.createCompany(name).pipe(finalize(() => this.savingCompany = false)).subscribe({
      next: company => {
        this.companies = this.sortCompanies([...this.companies, company]).map(item => ({ ...item, kindLabel: item.teamCompany ? 'Team interno' : 'Cliente' }) as Company);
        this.createCompanyVisible = false;
        this.openCompany(company);
      },
      error: () => this.companySaveError = 'Impossibile creare la compagnia. Riprova.'
    });
  }

  openCompany(company: Company): void {
    this.selectedCompany = company;
    this.companyUsers = [];
    this.userFormVisible = false;
    this.editingUser = null;
    this.userSaveError = '';
    this.companyDialogVisible = true;
    this.loadUsers();
  }

  closeCompany(): void {
    this.selectedCompany = null;
    this.userFormVisible = false;
    this.editingUser = null;
    this.deleteUserVisible = false;
    this.userToDelete = null;
    this.companyUsers = [];
  }

  loadUsers(): void {
    const companyId = this.selectedCompany?.id;
    if (companyId === undefined) return;
    this.usersLoading = true;
    this.usersError = '';
    this.api.companyUsers(companyId).pipe(finalize(() => this.usersLoading = false)).subscribe({
      next: users => {
        if (this.selectedCompany?.id === companyId) this.companyUsers = this.sortUsers(users);
      },
      error: () => {
        if (this.selectedCompany?.id === companyId) this.usersError = 'Impossibile caricare gli utenti. Riprova.';
      }
    });
  }

  showNewUser(): void {
    this.newUser = this.emptyUser();
    this.editingUser = null;
    this.userSaveError = '';
    this.userFormVisible = true;
  }

  editUser(user: CompanyUser): void {
    this.editingUser = user;
    this.newUser = {
      username: user.username,
      email: user.email,
      password: '',
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      wantEmail: user.wantEmail
    };
    this.userSaveError = '';
    this.userFormVisible = true;
  }

  saveUser(): void {
    const company = this.selectedCompany;
    if (!company || this.savingUser) return;
    const editing = this.editingUser;
    const password = this.newUser.password;
    const input: CompanyUserInput = {
      ...this.newUser,
      companyId: company.id,
      username: this.newUser.username.trim(),
      email: this.newUser.email.trim(),
      firstName: this.newUser.firstName?.trim() || null,
      lastName: this.newUser.lastName?.trim() || null,
      password: editing && !password ? null : password
    };
    if (!input.username || !input.email || (!editing && password.length < 12)
        || (password.length > 0 && password.length < 12)) return;

    this.savingUser = true;
    this.userSaveError = '';
    const request = editing
      ? this.api.updateCompanyUser(editing.id, input)
      : this.api.createCompanyUser(input);
    request.pipe(finalize(() => this.savingUser = false)).subscribe({
      next: user => {
        if (this.selectedCompany?.id !== company.id) return;
        this.companyUsers = this.sortUsers(editing
          ? this.companyUsers.map(existing => existing.id === user.id ? user : existing)
          : [...this.companyUsers, user]);
        this.userFormVisible = false;
        this.editingUser = null;
        this.newUser = this.emptyUser();
        this.projectContext.load();
      },
      error: (error: unknown) => {
        this.userSaveError = error instanceof HttpErrorResponse && error.status === 409
          ? 'Username o email già in uso.'
          : 'Impossibile salvare l’utente. Controlla i dati e riprova.';
      }
    });
  }

  confirmDeleteUser(user: CompanyUser): void {
    this.userToDelete = user;
    this.deleteUserError = '';
    this.deleteUserVisible = true;
  }

  deleteUser(): void {
    const user = this.userToDelete;
    if (!user || this.deletingUser) return;
    this.deletingUser = true;
    this.deleteUserError = '';
    this.api.deleteCompanyUser(user.id).pipe(finalize(() => this.deletingUser = false)).subscribe({
      next: () => {
        if (this.selectedCompany?.id === user.companyId) {
          this.companyUsers = this.companyUsers.filter(existing => existing.id !== user.id);
        }
        if (this.editingUser?.id === user.id) {
          this.userFormVisible = false;
          this.editingUser = null;
        }
        this.deleteUserVisible = false;
        this.userToDelete = null;
        this.projectContext.load();
      },
      error: () => this.deleteUserError = 'Impossibile eliminare l’utente. Riprova.'
    });
  }

  private emptyUser(): UserDraft {
    return { username: '', email: '', password: '', firstName: null, lastName: null,
      role: 'USER', wantEmail: null };
  }

  private sortCompanies(companies: Company[]): Company[] {
    return [...companies].sort((a, b) => a.name.localeCompare(b.name, 'it'));
  }

  private sortUsers(users: CompanyUser[]): CompanyUser[] {
    return [...users].sort((a, b) => a.username.localeCompare(b.username, 'it'));
  }
}
