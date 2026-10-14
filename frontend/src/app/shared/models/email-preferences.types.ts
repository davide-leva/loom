// Email preferences domain types extracted from email-preferences.service.ts.

export interface ProjectEmailPreference {
  projectId: number;
  projectName: string;
  wantEmail: boolean | null;
}

export interface EmailPreferences {
  globalWantEmail: boolean | null;
  onlyOwnIssues?: boolean;
  newIssues?: boolean;
  statusChanges?: 'NONE' | 'RELEASED' | 'ALL';
  comments?: boolean;
  dataChanges?: boolean;
  projects: ProjectEmailPreference[];
}