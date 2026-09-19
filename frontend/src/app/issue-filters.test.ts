import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { filterIssues } from './issue-filters';
import { IssueSummary } from './issues.service';

const issues: IssueSummary[] = [
  issue({ id: 1, title: 'Errore salvataggio', status: 'REPORTED', issueType: 'ANOMALY', issuerUserId: 10, issuerUsername: 'mario', createdAt: '2026-09-17T08:30:00.000Z' }),
  issue({ id: 2, title: 'Nuovo report', status: 'IN_PROGRESS', issueType: 'IMPLEMENTATION', issuerUserId: 11, issuerUsername: 'anna', devUserId: 20, devUsername: 'team1', createdAt: '2026-09-18T09:00:00.000Z' }),
  issue({ id: 3, title: 'Campo libero', status: 'COMPLETED', issueType: null, issuerUserId: null, issuerUsername: null, createdAt: '2026-09-19T10:15:00.000Z' })
];

describe('filterIssues', () => {
  it('filters by status, type, issuer and developer', () => {
    assert.deepEqual(filterIssues(issues, {
      status: 'IN_PROGRESS',
      type: 'IMPLEMENTATION',
      issuerId: 11,
      developerId: 20
    }).map(item => item.id), [2]);
  });

  it('supports unassigned issuer/type filters', () => {
    assert.deepEqual(filterIssues(issues, { type: 'NONE', issuerId: 'NONE' }).map(item => item.id), [3]);
  });

  it('filters by inclusive calendar date range and searchable text', () => {
    assert.deepEqual(filterIssues(issues, {
      text: 'report',
      from: new Date('2026-09-18T00:00:00'),
      to: new Date('2026-09-18T00:00:00')
    }).map(item => item.id), [2]);
  });
});

function issue(input: Partial<IssueSummary> & Pick<IssueSummary, 'id' | 'title' | 'status' | 'issueType' | 'createdAt'>): IssueSummary {
  return {
    projectId: 1,
    description: '',
    releasedAt: null,
    approvedAt: null,
    issuerUserId: null,
    issuerUsername: null,
    devUserId: null,
    devUsername: null,
    approveUserId: null,
    approveUsername: null,
    internal: false,
    ...input
  };
}
