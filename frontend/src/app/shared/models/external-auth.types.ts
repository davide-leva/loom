// External auth domain types extracted from external-auth.service.ts.

export interface ExternalSubjectMapping {
  id: number;
  subject: string;
  userId: number;
  username: string;
}

export interface ExternalJwtSecret {
  id: number;
  name: string;
  algorithm: 'HS256' | 'HS384' | 'HS512';
  secretBase64: boolean;
  userCount: number;
  mappings: ExternalSubjectMapping[];
}

export interface ExternalApplicationInput {
  name: string;
  secret: string;
  algorithm: ExternalJwtSecret['algorithm'];
  secretBase64: boolean;
}

export interface ExternalAuthConfig {
  projectId: number;
  enabled: boolean;
  secrets: ExternalJwtSecret[];
}