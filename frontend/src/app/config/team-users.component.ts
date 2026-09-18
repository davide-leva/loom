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
import { AdminConfigService, TeamRole, TeamUser, TeamUserInput } from './admin-config.service';
import { EntityColumn, EntityTableComponent } from './entity-table.component';

type TeamUserDraft = Omit<TeamUserInput, 'companyId' | 'password'> & { password: string };

@Component({
  selector: 'app-team-users',
  imports: [FormsModule, ButtonModule, CardModule, DialogModule, InputTextModule,
    PasswordModule, SelectModule, EntityTableComponent],
  templateUrl: './team-users.component.html',
  styleUrl: './team-users.component.css'
})
export class TeamUsersComponent implements OnInit {
  private readonly api = inject(AdminConfigService);

  readonly columns: EntityColumn[] = [
    { field: 'username', label: 'Username' },
    { field: 'firstName', label: 'Nome' },
    { field: 'lastName', label: 'Cognome' },
    { field: 'email', label: 'Email' },
    { field: 'role', label: 'Ruolo' }
  ];
  readonly roleOptions: { label: string; value: TeamRole }[] = [
    { label: 'Team', value: 'TEAM' },
    { label: 'Admin', value: 'ADMIN' }
  ];

  users: TeamUser[] = [];
  loading = false;
  loadError = '';

  formVisible = false;
  editingUser: TeamUser | null = null;
  draft: TeamUserDraft = this.emptyUser();
  saveError = '';
  saving = false;

  deleteVisible = false;
  userToDelete: TeamUser | null = null;
  deleteError = '';
  deleting = false;

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading = true;
    this.loadError = '';
    this.api.users().pipe(finalize(() => this.loading = false)).subscribe({
      next: users => this.users = this.sortUsers(users
        .filter((user): user is TeamUser => user.role === 'TEAM' || user.role === 'ADMIN')),
      error: () => this.loadError = 'Impossibile caricare gli utenti del team. Riprova.'
    });
  }

  showNewUser(): void {
    this.editingUser = null;
    this.draft = this.emptyUser();
    this.saveError = '';
    this.formVisible = true;
  }

  editUser(user: TeamUser): void {
    this.editingUser = user;
    this.draft = {
      username: user.username,
      email: user.email,
      password: '',
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      wantEmail: user.wantEmail
    };
    this.saveError = '';
    this.formVisible = true;
  }

  saveUser(): void {
    if (this.saving) return;
    const editing = this.editingUser;
    const password = this.draft.password;
    const input: TeamUserInput = {
      ...this.draft,
      companyId: null,
      username: this.draft.username.trim(),
      email: this.draft.email.trim(),
      firstName: this.draft.firstName?.trim() || null,
      lastName: this.draft.lastName?.trim() || null,
      password: editing && !password ? null : password
    };
    if (!input.username || !input.email || (!editing && password.length < 12)
        || (password.length > 0 && password.length < 12)) return;

    this.saving = true;
    this.saveError = '';
    const request = editing
      ? this.api.updateTeamUser(editing.id, input)
      : this.api.createTeamUser(input);
    request.pipe(finalize(() => this.saving = false)).subscribe({
      next: user => {
        this.users = this.sortUsers(editing
          ? this.users.map(existing => existing.id === user.id ? user : existing)
          : [...this.users, user]);
        this.formVisible = false;
        this.editingUser = null;
        this.draft = this.emptyUser();
      },
      error: (error: unknown) => {
        this.saveError = error instanceof HttpErrorResponse && error.status === 409
          ? 'Username o email già in uso.'
          : 'Impossibile salvare l’utente. Controlla i dati e riprova.';
      }
    });
  }

  confirmDeleteUser(user: TeamUser): void {
    this.userToDelete = user;
    this.deleteError = '';
    this.deleteVisible = true;
  }

  deleteUser(): void {
    const user = this.userToDelete;
    if (!user || this.deleting) return;
    this.deleting = true;
    this.deleteError = '';
    this.api.deleteUser(user.id).pipe(finalize(() => this.deleting = false)).subscribe({
      next: () => {
        this.users = this.users.filter(existing => existing.id !== user.id);
        if (this.editingUser?.id === user.id) {
          this.formVisible = false;
          this.editingUser = null;
        }
        this.deleteVisible = false;
        this.userToDelete = null;
      },
      error: () => this.deleteError = 'Impossibile eliminare l’utente. Riprova.'
    });
  }

  private emptyUser(): TeamUserDraft {
    return { username: '', email: '', password: '', firstName: null, lastName: null,
      role: 'TEAM', wantEmail: null };
  }

  private sortUsers(users: TeamUser[]): TeamUser[] {
    return [...users].sort((a, b) => a.username.localeCompare(b.username, 'it'));
  }
}
