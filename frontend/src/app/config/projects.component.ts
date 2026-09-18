import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { finalize, forkJoin } from 'rxjs';
import { ProjectContextService } from '../project-context.service';
import { AdminConfigService, AppUser, Company, Project, ProjectInput } from './admin-config.service';
import { EntityColumn, EntityTableComponent } from './entity-table.component';

interface ProjectRow extends Project {
  companyName: string;
}

interface MemberGroup {
  id: string;
  label: string;
  description: string;
  users: AppUser[];
}

interface UserOption {
  label: string;
  value: number;
}

@Component({
  selector: 'app-projects',
  imports: [FormsModule, ButtonModule, CardModule, DialogModule, InputTextModule, SelectModule,
    TableModule, EntityTableComponent],
  templateUrl: './projects.component.html',
  styleUrl: './projects.component.css'
})
export class ProjectsComponent implements OnInit {
  private readonly api = inject(AdminConfigService);
  private readonly projectContext = inject(ProjectContextService);

  readonly columns: EntityColumn[] = [
    { field: 'id', label: 'ID' },
    { field: 'name', label: 'Progetto' },
    { field: 'companyName', label: 'Compagnia' }
  ];

  projects: Project[] = [];
  rows: ProjectRow[] = [];
  companies: Company[] = [];
  allUsers: AppUser[] = [];
  loading = false;
  loadError = '';

  formVisible = false;
  editingProject: Project | null = null;
  draft: ProjectInput = { name: '', companyId: null };
  saveError = '';
  saving = false;
  members: AppUser[] = [];
  memberGroups: MemberGroup[] = [];
  expandedMemberGroups: Record<string, boolean> = {};
  membersLoading = false;
  membersError = '';
  selectedExternalUserId: number | null = null;
  assignError = '';
  assigning = false;
  removingUserId: number | null = null;

  deleteVisible = false;
  projectToDelete: Project | null = null;
  deleteError = '';
  deleting = false;

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading = true;
    this.loadError = '';
    forkJoin({ projects: this.api.projects(), companies: this.api.companies(), users: this.api.users() })
      .pipe(finalize(() => this.loading = false)).subscribe({
        next: ({ projects, companies, users }) => {
          this.projects = projects;
          this.companies = [...companies].sort((a, b) => a.name.localeCompare(b.name, 'it'));
          this.allUsers = users;
          this.updateRows();
          this.updateMemberGroups();
        },
        error: () => this.loadError = 'Impossibile caricare i progetti. Riprova.'
      });
  }

  openCreate(): void {
    this.editingProject = null;
    this.draft = { name: '', companyId: null };
    this.saveError = '';
    this.formVisible = true;
  }

  openEdit(row: ProjectRow): void {
    this.editingProject = this.projects.find(project => project.id === row.id) ?? null;
    if (!this.editingProject) return;
    this.draft = { name: this.editingProject.name, companyId: this.editingProject.companyId };
    this.saveError = '';
    this.formVisible = true;
    this.loadMembers();
  }

  closeForm(): void {
    this.editingProject = null;
    this.members = [];
    this.memberGroups = [];
    this.expandedMemberGroups = {};
    this.selectedExternalUserId = null;
    this.assignError = '';
    this.removingUserId = null;
  }

  loadMembers(): void {
    const project = this.editingProject;
    if (!project) return;
    this.membersLoading = true;
    this.membersError = '';
    this.api.projectUsers(project.id).pipe(finalize(() => this.membersLoading = false)).subscribe({
      next: members => {
        if (this.editingProject?.id !== project.id) return;
        this.members = members;
        this.selectedExternalUserId = null;
        this.assignError = '';
        this.updateMemberGroups();
      },
      error: () => this.membersError = 'Impossibile caricare gli utenti del progetto. Riprova.'
    });
  }

  get externalUserOptions(): UserOption[] {
    const project = this.editingProject;
    if (!project) return [];
    const memberIds = new Set(this.members.map(user => user.id));
    return this.allUsers
      .filter(user => !memberIds.has(user.id))
      .filter(user => project.companyId === null || user.companyId !== project.companyId)
      .map(user => ({
        value: user.id,
        label: `${user.username} (${this.userCompanyName(user)})`
      }))
      .sort((a, b) => a.label.localeCompare(b.label, 'it'));
  }

  assignExternalUser(): void {
    const project = this.editingProject;
    const userId = this.selectedExternalUserId;
    if (!project || userId === null || this.assigning) return;
    this.assigning = true;
    this.assignError = '';
    this.api.assignProjectUser(project.id, userId).pipe(finalize(() => this.assigning = false)).subscribe({
      next: () => this.loadMembers(),
      error: () => this.assignError = 'Impossibile assegnare l’utente al progetto. Riprova.'
    });
  }

  removeExplicitUser(user: AppUser): void {
    const project = this.editingProject;
    if (!project || this.isAutomaticMember(user) || this.removingUserId !== null) return;
    this.removingUserId = user.id;
    this.assignError = '';
    this.api.removeProjectUser(project.id, user.id).pipe(finalize(() => this.removingUserId = null)).subscribe({
      next: () => this.loadMembers(),
      error: () => this.assignError = 'Impossibile rimuovere l’utente dal progetto. Riprova.'
    });
  }

  isAutomaticMember(user: AppUser): boolean {
    const project = this.editingProject;
    return !!project && project.companyId !== null && user.companyId === project.companyId;
  }

  save(): void {
    const name = this.draft.name.trim();
    if (!name || name.length > 32 || this.saving) return;
    const input: ProjectInput = { name, companyId: this.draft.companyId };
    const editing = this.editingProject;
    this.saving = true;
    this.saveError = '';
    const request = editing
      ? this.api.updateProject(editing.id, input)
      : this.api.createProject(input);
    request.pipe(finalize(() => this.saving = false)).subscribe({
      next: project => {
        this.projects = editing
          ? this.projects.map(existing => existing.id === project.id ? project : existing)
          : [...this.projects, project];
        this.updateRows();
        this.projectContext.load();
        if (editing) {
          this.editingProject = project;
          this.draft = { name: project.name, companyId: project.companyId };
          this.loadMembers();
          return;
        }
        this.formVisible = false;
        this.editingProject = null;
      },
      error: () => this.saveError = 'Impossibile salvare il progetto. Riprova.'
    });
  }

  confirmDelete(row: ProjectRow): void {
    this.projectToDelete = this.projects.find(project => project.id === row.id) ?? null;
    if (!this.projectToDelete) return;
    this.deleteError = '';
    this.deleteVisible = true;
  }

  delete(): void {
    const project = this.projectToDelete;
    if (!project || this.deleting) return;
    this.deleting = true;
    this.deleteError = '';
    this.api.deleteProject(project.id).pipe(finalize(() => this.deleting = false)).subscribe({
      next: () => {
        this.projects = this.projects.filter(existing => existing.id !== project.id);
        this.updateRows();
        this.deleteVisible = false;
        this.projectToDelete = null;
        this.projectContext.load();
      },
      error: () => this.deleteError = 'Impossibile eliminare il progetto. Riprova.'
    });
  }

  private updateRows(): void {
    const companyNames = new Map(this.companies.map(company => [company.id, company.name]));
    this.rows = this.projects.map(project => ({
      ...project,
      companyName: project.companyId === null
        ? 'Nessuna compagnia'
        : companyNames.get(project.companyId) ?? 'Compagnia non disponibile'
    })).sort((a, b) => a.name.localeCompare(b.name, 'it'));
  }

  private updateMemberGroups(): void {
    const project = this.editingProject;
    if (!project) {
      this.memberGroups = [];
      this.expandedMemberGroups = {};
      return;
    }

    const company = this.companies.find(item => item.id === project.companyId);
    const companyUsers = project.companyId === null
      ? []
      : this.members.filter(user => user.companyId === project.companyId);
    const internalUsers = this.members.filter(user => user.companyId !== project.companyId);
    const groups: MemberGroup[] = [];

    if (project.companyId !== null) {
      groups.push({
        id: `company-${project.companyId}`,
        label: company?.name ?? 'Compagnia collegata',
        description: 'Utenti ereditati automaticamente dalla compagnia',
        users: this.sortUsers(companyUsers)
      });
    }

    const explicitGroups = new Map<string, MemberGroup>();
    for (const user of internalUsers) {
      const groupId = user.companyId === null ? 'instance-users' : `external-company-${user.companyId}`;
      const group = explicitGroups.get(groupId) ?? {
        id: groupId,
        label: user.companyId === null ? 'Istanza Software Due' : this.userCompanyName(user),
        description: user.companyId === null
          ? 'Utenti interni assegnati esplicitamente'
          : 'Utenti esterni assegnati esplicitamente',
        users: []
      };
      group.users.push(user);
      explicitGroups.set(groupId, group);
    }

    groups.push(...Array.from(explicitGroups.values())
      .map(group => ({ ...group, users: this.sortUsers(group.users) }))
      .sort((a, b) => a.label.localeCompare(b.label, 'it')));
    this.memberGroups = groups;
    this.expandedMemberGroups = Object.fromEntries(groups.map(group => [group.id, true]));
  }

  private sortUsers(users: AppUser[]): AppUser[] {
    return [...users].sort((a, b) => a.username.localeCompare(b.username, 'it'));
  }

  private userCompanyName(user: AppUser): string {
    if (user.companyId === null) return 'Software Due';
    return this.companies.find(company => company.id === user.companyId)?.name ?? 'Compagnia non disponibile';
  }

}
