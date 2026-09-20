// Auth domain types extracted from auth.service.ts.

export interface LoginResponse {
  accessToken: string;
  tokenType: string;
  expiresInSeconds: number;
}

export interface ExternalLoginResponse {
  session: LoginResponse;
  projectId: number;
}

export interface CurrentUser {
  id: number;
  username: string;
  displayName: string;
  email: string;
  role: string;
  companyName: string | null;
  companyId: number | null;
  primaryColor: string;
  companyLogoUrl: string | null;
  internalCompanyName: string | null;
  internalLogoUrl: string | null;
}

export interface ProjectSummary {
  id: number;
  name: string;
  logoUrl: string | null;
}