import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { AuthService } from '../auth.service';

export interface Company {
  id: number;
  name: string;
  teamCompany: boolean;
}

export type CompanyRole = 'USER' | 'SUPERUSER';
export type TeamRole = 'TEAM' | 'ADMIN';

export interface AppUser {
  id: number;
  companyId: number | null;
  username: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: CompanyRole | TeamRole;
  wantEmail: boolean | null;
}

export interface CompanyUser extends AppUser {
  companyId: number;
  role: CompanyRole;
}

export interface CompanyUserInput {
  companyId: number;
  username: string;
  email: string;
  password: string | null;
  firstName: string | null;
  lastName: string | null;
  role: CompanyRole;
  wantEmail: boolean | null;
}

export interface TeamUser extends AppUser {
  companyId: number;
  role: TeamRole;
}

export interface TeamUserInput {
  companyId?: number | null;
  username: string;
  email: string;
  password: string | null;
  firstName: string | null;
  lastName: string | null;
  role: TeamRole;
  wantEmail: boolean | null;
}

export interface Project {
  id: number;
  name: string;
  companyId: number | null;
}

export interface ProjectInput {
  name: string;
  companyId: number | null;
}

export type FieldType = 'TEXT' | 'TEXTAREA' | 'NUMBER' | 'SELECT' | 'ATTACHMENTS';
export type FieldScope = 'USER' | 'SUPERUSER' | 'TEAM';

export interface IssueField {
  id: number;
  projectId: number;
  code: string;
  label: string;
  mandatory: boolean;
  multiple: boolean;
  type: FieldType;
  scope: FieldScope;
}

export interface IssueFieldInput {
  projectId?: number;
  code: string;
  label: string;
  mandatory: boolean;
  multiple: boolean;
  type: FieldType;
  scope: FieldScope;
}

export interface IssueFieldOption {
  id: number;
  definitionId: number;
  projectId: number;
  value: string;
  label: string;
  active: boolean;
}

export interface IssueFieldOptionInput {
  definitionId?: number;
  value: string;
  label: string;
  active?: boolean;
}

@Injectable({ providedIn: 'root' })
export class AdminConfigService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  companies(): Observable<Company[]> {
    return this.http.get<Company[]>('/api/companies', { headers: this.auth.authHeaders() });
  }

  createCompany(name: string): Observable<Company> {
    return this.http.post<Company>('/api/companies', { name }, { headers: this.auth.authHeaders() });
  }

  companyUsers(companyId: number): Observable<CompanyUser[]> {
    return this.http.get<CompanyUser[]>(`/api/users/company/${companyId}`, {
      headers: this.auth.authHeaders()
    });
  }

  createCompanyUser(input: CompanyUserInput): Observable<CompanyUser> {
    return this.http.post<CompanyUser>('/api/users', input, { headers: this.auth.authHeaders() });
  }

  updateCompanyUser(id: number, input: CompanyUserInput): Observable<CompanyUser> {
    return this.http.put<CompanyUser>(`/api/users/${id}`, input, { headers: this.auth.authHeaders() });
  }

  deleteCompanyUser(id: number): Observable<void> {
    return this.http.delete<void>(`/api/users/${id}`, { headers: this.auth.authHeaders() });
  }

  users(): Observable<AppUser[]> {
    return this.http.get<AppUser[]>('/api/users', { headers: this.auth.authHeaders() });
  }

  createTeamUser(input: TeamUserInput): Observable<TeamUser> {
    return this.http.post<TeamUser>('/api/users', input, { headers: this.auth.authHeaders() });
  }

  updateTeamUser(id: number, input: TeamUserInput): Observable<TeamUser> {
    return this.http.put<TeamUser>(`/api/users/${id}`, input, { headers: this.auth.authHeaders() });
  }

  deleteUser(id: number): Observable<void> {
    return this.http.delete<void>(`/api/users/${id}`, { headers: this.auth.authHeaders() });
  }

  projects(): Observable<Project[]> {
    return this.http.get<Project[]>('/api/projects', { headers: this.auth.authHeaders() });
  }

  createProject(input: ProjectInput): Observable<Project> {
    return this.http.post<Project>('/api/projects', input, { headers: this.auth.authHeaders() });
  }

  updateProject(id: number, input: ProjectInput): Observable<Project> {
    return this.http.put<Project>(`/api/projects/${id}`, input, { headers: this.auth.authHeaders() });
  }

  deleteProject(id: number): Observable<void> {
    return this.http.delete<void>(`/api/projects/${id}`, { headers: this.auth.authHeaders() });
  }

  projectUsers(projectId: number): Observable<AppUser[]> {
    return this.http.get<AppUser[]>(`/api/users/project/${projectId}`, {
      headers: this.auth.authHeaders()
    });
  }

  assignProjectUser(projectId: number, userId: number): Observable<unknown> {
    return this.http.post('/api/project-users', { projectId, userId }, { headers: this.auth.authHeaders() });
  }

  removeProjectUser(projectId: number, userId: number): Observable<void> {
    return this.http.delete<void>(`/api/project-users/${projectId}/${userId}`, {
      headers: this.auth.authHeaders()
    });
  }

  issueFields(projectId: number): Observable<IssueField[]> {
    return this.http.get<IssueField[]>(`/api/issue-fields/project/${projectId}`, {
      headers: this.auth.authHeaders()
    });
  }

  createIssueField(input: IssueFieldInput & { projectId: number }): Observable<IssueField> {
    return this.http.post<IssueField>('/api/issue-fields', input, { headers: this.auth.authHeaders() });
  }

  updateIssueField(id: number, input: IssueFieldInput): Observable<IssueField> {
    return this.http.put<IssueField>(`/api/issue-fields/${id}`, input, { headers: this.auth.authHeaders() });
  }

  deleteIssueField(id: number): Observable<void> {
    return this.http.delete<void>(`/api/issue-fields/${id}`, { headers: this.auth.authHeaders() });
  }

  issueFieldOptions(definitionId: number): Observable<IssueFieldOption[]> {
    return this.http.get<IssueFieldOption[]>(`/api/issue-field-options/field/${definitionId}`, {
      headers: this.auth.authHeaders()
    });
  }

  createIssueFieldOption(input: IssueFieldOptionInput & { definitionId: number }): Observable<IssueFieldOption> {
    return this.http.post<IssueFieldOption>('/api/issue-field-options', input, { headers: this.auth.authHeaders() });
  }

  updateIssueFieldOption(id: number, input: { value: string; label: string; active: boolean }): Observable<IssueFieldOption> {
    return this.http.put<IssueFieldOption>(`/api/issue-field-options/${id}`, input, {
      headers: this.auth.authHeaders()
    });
  }

  deleteIssueFieldOption(id: number): Observable<void> {
    return this.http.delete<void>(`/api/issue-field-options/${id}`, { headers: this.auth.authHeaders() });
  }

}
