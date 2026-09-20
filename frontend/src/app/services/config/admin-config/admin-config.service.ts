import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { AuthService } from '../../auth/auth.service';
import type {
  AppUser,
  Company,
  CompanyRole,
  CompanyUser,
  CompanyUserInput,
  FieldScope,
  FieldType,
  IssueField,
  IssueFieldInput,
  IssueFieldOption,
  IssueFieldOptionInput,
  Project,
  ProjectInput,
  TeamRole,
  TeamUser,
  TeamUserInput
} from '../../../shared/models/admin.types';

export type {
  AppUser,
  Company,
  CompanyRole,
  CompanyUser,
  CompanyUserInput,
  FieldScope,
  FieldType,
  IssueField,
  IssueFieldInput,
  IssueFieldOption,
  IssueFieldOptionInput,
  Project,
  ProjectInput,
  TeamRole,
  TeamUser,
  TeamUserInput
};

@Injectable({ providedIn: 'root' })
export class AdminConfigService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  private brandForm(input: object, logo: File | null): FormData {
    const form = new FormData();
    form.append('input', new Blob([JSON.stringify(input)], { type: 'application/json' }));
    if (logo) form.append('logo', logo);
    return form;
  }

  companies(): Observable<Company[]> {
    return this.http.get<Company[]>('/api/companies', { headers: this.auth.authHeaders() });
  }

  createCompany(name: string, primaryColor: string, logo: File | null): Observable<Company> {
    return this.http.post<Company>('/api/companies', this.brandForm({ name, primaryColor }, logo),
      { headers: this.auth.authHeaders() });
  }

  updateCompany(id: number, name: string, primaryColor: string, logo: File | null): Observable<Company> {
    return this.http.put<Company>(`/api/companies/${id}`, this.brandForm({ name, primaryColor }, logo),
      { headers: this.auth.authHeaders() });
  }

  deleteCompanyLogo(id: number): Observable<void> {
    return this.http.delete<void>(`/api/companies/${id}/logo`, { headers: this.auth.authHeaders() });
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

  createProject(input: ProjectInput, logo: File | null = null): Observable<Project> {
    return this.http.post<Project>('/api/projects', this.brandForm(input, logo),
      { headers: this.auth.authHeaders() });
  }

  updateProject(id: number, input: ProjectInput, logo: File | null = null): Observable<Project> {
    return this.http.put<Project>(`/api/projects/${id}`, this.brandForm(input, logo),
      { headers: this.auth.authHeaders() });
  }

  deleteProjectLogo(id: number): Observable<void> {
    return this.http.delete<void>(`/api/projects/${id}/logo`, { headers: this.auth.authHeaders() });
  }

  deleteProject(id: number): Observable<void> {
    return this.http.delete<void>(`/api/projects/${id}`, { headers: this.auth.authHeaders() });
  }

  updateProjectArchiveAfterDays(id: number, archiveAfterDays: number | null): Observable<Project> {
    return this.http.put<Project>(`/api/projects/${id}/archive-after-days`,
      { archiveAfterDays }, { headers: this.auth.authHeaders() });
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
