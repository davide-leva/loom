import { HttpHeaders } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { AdminConfigService } from './admin-config.service';
import { AuthService } from '../../auth/auth.service';
import type {
  AppUser,
  Company,
  CompanyUser,
  CompanyUserInput,
  SegnalazioneCampo,
  SegnalazioneCampoInput,
  SegnalazioneCampoOpzione,
  SegnalazioneCampoOpzioneInput,
  Project,
  ProjectInput,
  TeamUser,
  TeamUserInput
} from '../../../shared/models/admin.types';

describe('AdminConfigService', () => {
  let service: AdminConfigService;
  let http: HttpTestingController;
  let auth: { authHeaders: jest.Mock };

  const company: Company = {
    id: 1,
    name: 'ACME',
    teamCompany: true,
    primaryColor: 'red',
    logoUrl: null
  };

  const project: Project = {
    id: 7,
    name: 'Alpha',
    companyId: 1,
    logoUrl: null,
    archiveAfterDays: 30
  };

  const user: AppUser = {
    id: 11,
    companyId: 1,
    username: 'mario',
    email: 'mario@test',
    firstName: null,
    lastName: null,
    role: 'TEAM',
    wantEmail: true
  };

  const field: SegnalazioneCampo = {
    id: 100,
    projectId: 7,
    code: 'SEVERITY',
    label: 'Severity',
    description: null,
    mandatory: false,
    multiple: false,
    type: 'SELECT',
    scope: 'TEAM',
    hasValues: false
  };

  const option: SegnalazioneCampoOpzione = {
    id: 200,
    definitionId: 100,
    projectId: 7,
    value: 'LOW',
    label: 'Low',
    active: true
  };

  beforeEach(() => {
    sessionStorage.clear();
    auth = { authHeaders: jest.fn(() => new HttpHeaders({ Authorization: 'Bearer test' })) };
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: auth }
      ]
    });
    service = TestBed.inject(AdminConfigService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    sessionStorage.clear();
  });

  describe('companies', () => {
    it('companies() GETs the list', () => {
      let resolved: Company[] | undefined;
      service.companies().subscribe(value => { resolved = value; });
      const req = http.expectOne('/api/companies');
      expect(req.request.method).toBe('GET');
      expect(req.request.headers.get('Authorization')).toBe('Bearer test');
      req.flush([company]);
      expect(resolved).toEqual([company]);
    });

    it('createCompany() POSTs a brand form with logo', () => {
      const logo = new File(['logo'], 'logo.png', { type: 'image/png' });
      let resolved: Company | undefined;
      service.createCompany('ACME', 'red', logo).subscribe(value => { resolved = value; });
      const req = http.expectOne('/api/companies');
      expect(req.request.method).toBe('POST');
      expect(req.request.body instanceof FormData).toBe(true);
      const form = req.request.body as FormData;
      const inputBlob = form.get('input') as Blob;
      expect(inputBlob.type).toBe('application/json');
      expect((form.get('logo') as File).name).toBe('logo.png');
      expect(req.request.headers.get('Authorization')).toBe('Bearer test');
      req.flush(company);
      expect(resolved).toEqual(company);
    });

    it('updateCompany() PUTs a brand form', () => {
      const logo = new File(['logo'], 'logo.png', { type: 'image/png' });
      let resolved: Company | undefined;
      service.updateCompany(1, 'ACME', 'red', logo).subscribe(value => { resolved = value; });
      const req = http.expectOne('/api/companies/1');
      expect(req.request.method).toBe('PUT');
      expect(req.request.body instanceof FormData).toBe(true);
      expect(req.request.headers.get('Authorization')).toBe('Bearer test');
      req.flush(company);
      expect(resolved).toEqual(company);
    });

    it('deleteCompanyLogo() DELETEs the logo endpoint', () => {
      let resolved: void | undefined;
      service.deleteCompanyLogo(1).subscribe(value => { resolved = value; });
      const req = http.expectOne('/api/companies/1/logo');
      expect(req.request.method).toBe('DELETE');
      expect(req.request.headers.get('Authorization')).toBe('Bearer test');
      req.flush(null);
      expect(resolved).toBeNull();
    });
  });

  describe('projects', () => {
    it('projects() GETs the list', () => {
      let resolved: Project[] | undefined;
      service.projects().subscribe(value => { resolved = value; });
      const req = http.expectOne('/api/projects');
      expect(req.request.method).toBe('GET');
      expect(req.request.headers.get('Authorization')).toBe('Bearer test');
      req.flush([project]);
      expect(resolved).toEqual([project]);
    });

    it('createProject() POSTs a brand form', () => {
      const input: ProjectInput = { name: 'Alpha', companyId: 1, archiveAfterDays: 30 };
      let resolved: Project | undefined;
      service.createProject(input, null).subscribe(value => { resolved = value; });
      const req = http.expectOne('/api/projects');
      expect(req.request.method).toBe('POST');
      expect(req.request.body instanceof FormData).toBe(true);
      expect(req.request.headers.get('Authorization')).toBe('Bearer test');
      req.flush(project);
      expect(resolved).toEqual(project);
    });

    it('updateProject() PUTs a brand form with logo', () => {
      const logo = new File(['logo'], 'logo.png', { type: 'image/png' });
      const input: ProjectInput = { name: 'Alpha', companyId: 1 };
      let resolved: Project | undefined;
      service.updateProject(7, input, logo).subscribe(value => { resolved = value; });
      const req = http.expectOne('/api/projects/7');
      expect(req.request.method).toBe('PUT');
      const form = req.request.body as FormData;
      expect(form.has('logo')).toBe(true);
      expect(req.request.headers.get('Authorization')).toBe('Bearer test');
      req.flush(project);
      expect(resolved).toEqual(project);
    });

    it('deleteProject() DELETEs the project', () => {
      let resolved: void | undefined;
      service.deleteProject(7).subscribe(value => { resolved = value; });
      const req = http.expectOne('/api/projects/7');
      expect(req.request.method).toBe('DELETE');
      expect(req.request.headers.get('Authorization')).toBe('Bearer test');
      req.flush(null);
      expect(resolved).toBeNull();
    });
  });

  describe('users', () => {
    it('users() GETs the global user list', () => {
      let resolved: AppUser[] | undefined;
      service.users().subscribe(value => { resolved = value; });
      const req = http.expectOne('/api/users');
      expect(req.request.method).toBe('GET');
      expect(req.request.headers.get('Authorization')).toBe('Bearer test');
      req.flush([user]);
      expect(resolved).toEqual([user]);
    });

    it('createCompanyUser() POSTs a JSON payload', () => {
      const input: CompanyUserInput = {
        companyId: 1,
        username: 'mario',
        email: 'mario@test',
        password: 'secret',
        firstName: null,
        lastName: null,
        role: 'USER',
        wantEmail: true
      };
      const created: CompanyUser = { ...user, companyId: 1, role: 'USER' };
      let resolved: CompanyUser | undefined;
      service.createCompanyUser(input).subscribe(value => { resolved = value; });
      const req = http.expectOne('/api/users');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(input);
      expect(req.request.headers.get('Authorization')).toBe('Bearer test');
      req.flush(created);
      expect(resolved).toEqual(created);
    });

    it('updateCompanyUser() PUTs a JSON payload', () => {
      const input: CompanyUserInput = {
        companyId: 1,
        username: 'mario',
        email: 'mario@test',
        password: null,
        firstName: null,
        lastName: null,
        role: 'USER',
        wantEmail: false
      };
      const updated: CompanyUser = { ...user, companyId: 1, role: 'USER', wantEmail: false };
      let resolved: CompanyUser | undefined;
      service.updateCompanyUser(11, input).subscribe(value => { resolved = value; });
      const req = http.expectOne('/api/users/11');
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toEqual(input);
      expect(req.request.headers.get('Authorization')).toBe('Bearer test');
      req.flush(updated);
      expect(resolved).toEqual(updated);
    });

    it('createTeamUser() POSTs a team-user JSON payload', () => {
      const input: TeamUserInput = {
        companyId: 1,
        username: 'admin',
        email: 'admin@test',
        password: 'secret',
        firstName: null,
        lastName: null,
        role: 'ADMIN',
        wantEmail: true
      };
      const team: TeamUser = { ...user, companyId: 1, role: 'ADMIN' };
      let resolved: TeamUser | undefined;
      service.createTeamUser(input).subscribe(value => { resolved = value; });
      const req = http.expectOne('/api/users');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(input);
      expect(req.request.headers.get('Authorization')).toBe('Bearer test');
      req.flush(team);
      expect(resolved).toEqual(team);
    });

    it('updateTeamUser() PUTs a team-user JSON payload', () => {
      const input: TeamUserInput = {
        companyId: 1,
        username: 'admin',
        email: 'admin@test',
        password: null,
        firstName: null,
        lastName: null,
        role: 'ADMIN',
        wantEmail: null
      };
      const team: TeamUser = { ...user, companyId: 1, role: 'ADMIN' };
      let resolved: TeamUser | undefined;
      service.updateTeamUser(11, input).subscribe(value => { resolved = value; });
      const req = http.expectOne('/api/users/11');
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toEqual(input);
      expect(req.request.headers.get('Authorization')).toBe('Bearer test');
      req.flush(team);
      expect(resolved).toEqual(team);
    });

    it('deleteUser() DELETEs the user', () => {
      let resolved: void | undefined;
      service.deleteUser(11).subscribe(value => { resolved = value; });
      const req = http.expectOne('/api/users/11');
      expect(req.request.method).toBe('DELETE');
      expect(req.request.headers.get('Authorization')).toBe('Bearer test');
      req.flush(null);
      expect(resolved).toBeNull();
    });
  });

  describe('segnalazione fields', () => {
    it('issueFields() GETs the fields for the project', () => {
      let resolved: SegnalazioneCampo[] | undefined;
      service.segnalazioneCampi(7).subscribe(value => { resolved = value; });
      const req = http.expectOne('/api/issue-fields/project/7');
      expect(req.request.method).toBe('GET');
      expect(req.request.headers.get('Authorization')).toBe('Bearer test');
      req.flush([field]);
      expect(resolved).toEqual([field]);
    });

    it('creaSegnalazioneCampo() POSTs the input payload', () => {
      const input: SegnalazioneCampoInput & { projectId: number } = {
        projectId: 7,
        code: 'SEVERITY',
        label: 'Severity',
        description: null,
        mandatory: false,
        multiple: false,
        type: 'SELECT',
        scope: 'TEAM'
      };
      let resolved: SegnalazioneCampo | undefined;
      service.creaSegnalazioneCampo(input).subscribe(value => { resolved = value; });
      const req = http.expectOne('/api/issue-fields');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(input);
      expect(req.request.headers.get('Authorization')).toBe('Bearer test');
      req.flush(field);
      expect(resolved).toEqual(field);
    });

    it('aggiornaSegnalazioneCampo() PUTs the input payload', () => {
      const input: SegnalazioneCampoInput = {
        code: 'SEVERITY',
        label: 'Severity',
        description: null,
        mandatory: false,
        multiple: false,
        type: 'SELECT',
        scope: 'TEAM'
      };
      let resolved: SegnalazioneCampo | undefined;
      service.aggiornaSegnalazioneCampo(100, input).subscribe(value => { resolved = value; });
      const req = http.expectOne('/api/issue-fields/100');
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toEqual(input);
      expect(req.request.headers.get('Authorization')).toBe('Bearer test');
      req.flush(field);
      expect(resolved).toEqual(field);
    });

    it('eliminaSegnalazioneCampo() DELETEs the field', () => {
      let resolved: void | undefined;
      service.eliminaSegnalazioneCampo(100).subscribe(value => { resolved = value; });
      const req = http.expectOne('/api/issue-fields/100');
      expect(req.request.method).toBe('DELETE');
      expect(req.request.headers.get('Authorization')).toBe('Bearer test');
      req.flush(null);
      expect(resolved).toBeNull();
    });
  });

  describe('segnalazione field options', () => {
    it('issueFieldOptions() GETs the options for the definition', () => {
      let resolved: SegnalazioneCampoOpzione[] | undefined;
      service.segnalazioneCampoOpzioni(100).subscribe(value => { resolved = value; });
      const req = http.expectOne('/api/issue-field-options/field/100');
      expect(req.request.method).toBe('GET');
      expect(req.request.headers.get('Authorization')).toBe('Bearer test');
      req.flush([option]);
      expect(resolved).toEqual([option]);
    });

    it('creaSegnalazioneCampoOpzione() POSTs the option payload', () => {
      const input: SegnalazioneCampoOpzioneInput & { definitionId: number } = {
        definitionId: 100,
        value: 'LOW',
        label: 'Low',
        active: true
      };
      let resolved: SegnalazioneCampoOpzione | undefined;
      service.creaSegnalazioneCampoOpzione(input).subscribe(value => { resolved = value; });
      const req = http.expectOne('/api/issue-field-options');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(input);
      expect(req.request.headers.get('Authorization')).toBe('Bearer test');
      req.flush(option);
      expect(resolved).toEqual(option);
    });

    it('aggiornaSegnalazioneCampoOpzione() PUTs the option payload', () => {
      const input = { value: 'LOW', label: 'Low', active: true };
      let resolved: SegnalazioneCampoOpzione | undefined;
      service.aggiornaSegnalazioneCampoOpzione(200, input).subscribe(value => { resolved = value; });
      const req = http.expectOne('/api/issue-field-options/200');
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toEqual(input);
      expect(req.request.headers.get('Authorization')).toBe('Bearer test');
      req.flush(option);
      expect(resolved).toEqual(option);
    });

    it('eliminaSegnalazioneCampoOpzione() DELETEs the option', () => {
      let resolved: void | undefined;
      service.eliminaSegnalazioneCampoOpzione(200).subscribe(value => { resolved = value; });
      const req = http.expectOne('/api/issue-field-options/200');
      expect(req.request.method).toBe('DELETE');
      expect(req.request.headers.get('Authorization')).toBe('Bearer test');
      req.flush(null);
      expect(resolved).toBeNull();
    });
  });
});
