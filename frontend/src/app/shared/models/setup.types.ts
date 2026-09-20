// Setup domain types extracted from setup.service.ts.

export interface SetupStatus {
  required: boolean;
}

export interface SetupInput {
  teamCompanyName: string;
  primaryColor: string;
  username: string;
  email: string;
  password: string;
  firstName: string | null;
  lastName: string | null;
}