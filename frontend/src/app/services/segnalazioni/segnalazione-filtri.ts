import type { StatusSegnalazione, SegnalazioneSummary, TipoSegnalazione } from './segnalazioni.service';

export type SelectFilterValue = string[] | 'ALL' | 'NONE';

export interface FiltriSegnalazioni {
  text?: string;
  status?: StatusSegnalazione | 'ALL';
  type?: TipoSegnalazione | 'ALL' | 'NONE' | null;
  issuerId?: number | 'ALL' | 'NONE';
  developerId?: number | 'ALL' | 'NONE';
  from?: Date | null;
  to?: Date | null;
  excludeDeleted?: boolean;
  excludeArchived?: boolean;
  /**
   * Map of select field definition id → accepted option values. Empty array / 'NONE' / 'ALL'
   * behave like the existing issuer/developer filters. Multiple values inside the same array are
   * OR'd; multiple keys are AND'd.
   */
  selectValues?: Record<number, SelectFilterValue>;
}

export function filtraSegnalazioni(issues: SegnalazioneSummary[], filters: FiltriSegnalazioni): SegnalazioneSummary[] {
  const text = filters.text?.trim().toLowerCase() ?? '';
  const from = filters.from ? new Date(filters.from).setHours(0, 0, 0, 0) : null;
  const to = filters.to ? new Date(filters.to).setHours(23, 59, 59, 999) : null;
  const excludeDeleted = filters.excludeDeleted ?? true;
  const excludeArchived = filters.excludeArchived ?? true;
  const selectFilters = filters.selectValues ?? {};
  return issues.filter(issue => {
    if (excludeDeleted && issue.deletedAt) return false;
    if (excludeArchived && issue.archivedAt) return false;
    if (filters.status && filters.status !== 'ALL' && issue.status !== filters.status) return false;
    if (filters.type === 'NONE' && issue.issueType !== null) return false;
    if (filters.type && filters.type !== 'ALL' && filters.type !== 'NONE' && issue.issueType !== filters.type) return false;
    if (filters.issuerId === 'NONE' && issue.issuerUserId !== null) return false;
    if (typeof filters.issuerId === 'number' && issue.issuerUserId !== filters.issuerId) return false;
    if (filters.developerId === 'NONE' && issue.devUserId !== null) return false;
    if (typeof filters.developerId === 'number' && issue.devUserId !== filters.developerId) return false;
    for (const [fieldId, accepted] of Object.entries(selectFilters)) {
      if (accepted === 'ALL' || accepted === undefined) continue;
      const id = Number(fieldId);
      const values = issue.selectValues?.[id] ?? [];
      if (accepted === 'NONE') {
        if (values.length > 0) return false;
        continue;
      }
      if (Array.isArray(accepted)) {
        if (accepted.length === 0) continue;
        const intersects = accepted.some(option => values.includes(option));
        if (!intersects) return false;
      }
    }
    const created = new Date(issue.createdAt).getTime();
    if (from !== null && created < from) return false;
    if (to !== null && created > to) return false;
    if (!text) return true;
    return testoCercabileSegnalazione(issue).some(value => value.toLowerCase().includes(text));
  });
}

function testoCercabileSegnalazione(issue: SegnalazioneSummary): string[] {
  return [
    issue.id.toString(),
    issue.title,
    issue.description,
    issue.issuerUsername ?? '',
    issue.devUsername ?? '',
    STATUS_LABELS[issue.status],
    issue.issueType === null ? 'Non categorizzata' : TYPE_LABELS[issue.issueType]
  ];
}

const STATUS_LABELS: Record<StatusSegnalazione, string> = {
  REPORTED: 'Segnalato',
  IN_PROGRESS: 'In lavorazione',
  COMPLETED: 'Completato',
  RELEASED: 'Rilasciato',
  APPROVED: 'Approvato'
};

const TYPE_LABELS: Record<TipoSegnalazione, string> = {
  ANOMALY: 'Anomalia',
  IMPROVEMENT: 'Miglioria',
  IMPLEMENTATION: 'Implementazione'
};
