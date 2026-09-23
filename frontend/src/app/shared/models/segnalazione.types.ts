// Issue domain types extracted from segnalazioni.service.ts.

export type StatusSegnalazione = 'REPORTED' | 'IN_PROGRESS' | 'COMPLETED' | 'RELEASED' | 'APPROVED';
export type TipoSegnalazione = 'ANOMALY' | 'IMPROVEMENT' | 'IMPLEMENTATION';
export type UserRole = 'ADMIN' | 'TEAM' | 'SUPERUSER' | 'USER';

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
  hasValues: boolean;
}

export interface SegnalazioneCampoOpzione {
  id: number;
  definitionId: number;
  projectId: number;
  value: string;
  label: string;
  active: boolean;
}

export interface SegnalazioneCampoValoreInput {
  definitionId: number;
  position: number;
  value: string;
}

export interface SegnalazioneValore {
  id: number;
  issueId: number;
  projectId: number;
  definitionId: number;
  label: string;
  position: number;
  value: string;
}

export interface SegnalazioneAllegato {
  id: number;
  issueId: number;
  projectId: number;
  definitionId: number | null;
  originalName: string;
  contentType: string | null;
  fileSize: number;
  uploadedAt: string;
  userId: number | null;
  username: string | null;
}

export interface SegnalazioneCommento {
  id: number;
  issueId: number;
  projectId: number;
  userId: number | null;
  username: string | null;
  date: string;
  comment: string;
  canDelete: boolean;
}

export interface SegnalazioneDettaglio {
  issue: SegnalazioneSummary;
  values: SegnalazioneValore[];
  attachments: SegnalazioneAllegato[];
  comments: SegnalazioneCommento[];
}

export interface SegnalazioneSummary {
  id: number;
  projectId: number;
  title: string;
  description: string;
  createdAt: string;
  status: StatusSegnalazione;
  issueType: TipoSegnalazione | null;
  releasedAt: string | null;
  approvedAt: string | null;
  issuerUserId: number | null;
  issuerUsername: string | null;
  devUserId: number | null;
  devUsername: string | null;
  approveUserId: number | null;
  approveUsername: string | null;
  internal: boolean;
  deletedAt: string | null;
  archivedAt: string | null;
  selectValues: Record<number, string[]>;
}

export interface CreaSegnalazioneInput {
  projectId: number;
  title: string;
  description: string;
  values: SegnalazioneCampoValoreInput[];
  internal: boolean;
}

export interface ProjectUserSummary {
  id: number;
  username: string;
  firstName: string | null;
  lastName: string | null;
  role: UserRole;
}

export interface FiltriReportSegnalazioni {
  search?: string;
  status?: StatusSegnalazione;
  issueType?: TipoSegnalazione;
  uncategorized?: boolean;
  issuerId?: number;
  issuerUnassigned?: boolean;
  developerId?: number;
  developerUnassigned?: boolean;
  internal?: boolean;
  from?: string;
  to?: string;
}

export const SEGNALAZIONE_STATUS: StatusSegnalazione[] = ['REPORTED', 'IN_PROGRESS', 'COMPLETED', 'RELEASED', 'APPROVED'];

export const STATUS_LABELS: Record<StatusSegnalazione, string> = {
  REPORTED: 'Segnalato',
  IN_PROGRESS: 'In lavorazione',
  COMPLETED: 'Completato',
  RELEASED: 'Rilasciato',
  APPROVED: 'Approvato'
};

export const TYPE_LABELS: Record<TipoSegnalazione, string> = {
  ANOMALY: 'Anomalia',
  IMPROVEMENT: 'Miglioria',
  IMPLEMENTATION: 'Implementazione'
};