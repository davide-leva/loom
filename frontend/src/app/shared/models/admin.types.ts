// Admin config domain types extracted from admin-config.service.ts.

export interface Company {
  id: number;
  name: string;
  teamCompany: boolean;
  primaryColor: string;
  logoUrl: string | null;
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
  logoUrl: string | null;
  archiveAfterDays: number | null;
}

export interface ProjectInput {
  name: string;
  companyId: number | null;
  archiveAfterDays?: number | null;
}

export type FieldType = 'TEXT' | 'TEXTAREA' | 'NUMBER' | 'SELECT' | 'ATTACHMENTS';
export type FieldScope = 'USER' | 'SUPERUSER' | 'TEAM';

export interface SegnalazioneCampo {
  id: number;
  projectId: number;
  code: string;
  label: string;
  description: string | null;
  mandatory: boolean;
  multiple: boolean;
  type: FieldType;
  scope: FieldScope;
}

export interface SegnalazioneCampoInput {
  projectId?: number;
  code: string;
  label: string;
  description?: string | null;
  mandatory: boolean;
  multiple: boolean;
  type: FieldType;
  scope: FieldScope;
}

export interface SegnalazioneCampoOpzione {
  id: number;
  definitionId: number;
  projectId: number;
  value: string;
  label: string;
  active: boolean;
}

export interface SegnalazioneCampoOpzioneInput {
  definitionId?: number;
  value: string;
  label: string;
  active?: boolean;
}