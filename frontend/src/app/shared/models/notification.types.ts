// Notification domain types extracted from issue-notifications.service.ts.

import type { TipoSegnalazione } from './segnalazione.types';

export interface SegnalazioneNonLetta {
  issueId: number;
  issueType: TipoSegnalazione | null;
}

export interface RiepilogoNotificheSegnalazioni {
  projectId: number;
  total: number;
  planning: number;
  anomalies: number;
  improvements: number;
  implementations: number;
  issues: SegnalazioneNonLetta[];
}

export type SezioneNotifica = 'PLANNING' | TipoSegnalazione;