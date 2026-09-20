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

  it('excludes soft-deleted and archived issues by default', () => {
    const deleted = issue({ id: 4, title: 'Eliminata', status: 'REPORTED', issueType: null,
                            createdAt: '2026-09-19T11:00:00.000Z', deletedAt: '2026-09-19T12:00:00.000Z' });
    const archived = issue({ id: 5, title: 'Archiviata', status: 'RELEASED', issueType: null,
                             createdAt: '2026-09-15T11:00:00.000Z', archivedAt: '2026-09-19T12:00:00.000Z' });
    // Input order is preserved; soft-deleted and archived rows are removed.
    assert.deepEqual(filterIssues([...issues, deleted, archived], {}).map(item => item.id), [1, 2, 3]);
  });

  it('returns deleted issues when excludeDeleted is false', () => {
    const deleted = issue({ id: 4, title: 'Eliminata', status: 'REPORTED', issueType: null,
                            createdAt: '2026-09-19T11:00:00.000Z', deletedAt: '2026-09-19T12:00:00.000Z' });
    assert.deepEqual(filterIssues([deleted], { excludeDeleted: false }).map(item => item.id), [4]);
  });

  it('returns archived issues when excludeArchived is false', () => {
    const archived = issue({ id: 5, title: 'Archiviata', status: 'RELEASED', issueType: null,
                             createdAt: '2026-09-15T11:00:00.000Z', archivedAt: '2026-09-19T12:00:00.000Z' });
    assert.deepEqual(filterIssues([archived], { excludeArchived: false }).map(item => item.id), [5]);
  });

  it('filters issues by select field values with OR logic inside a field', () => {
    const a = issue({ id: 1, title: 'A', status: 'REPORTED', issueType: null,
                      createdAt: '2026-09-19T10:00:00.000Z', selectValues: { 10: ['LOW'] } });
    const b = issue({ id: 2, title: 'B', status: 'REPORTED', issueType: null,
                      createdAt: '2026-09-19T11:00:00.000Z', selectValues: { 10: ['HIGH'] } });
    const c = issue({ id: 3, title: 'C', status: 'REPORTED', issueType: null,
                      createdAt: '2026-09-19T12:00:00.000Z', selectValues: { 10: ['MEDIUM'] } });
    assert.deepEqual(filterIssues([a, b, c], { selectValues: { 10: ['LOW', 'HIGH'] } }).map(i => i.id), [1, 2]);
  });

  it('excludes issues missing the select value when filter is NONE', () => {
    const withValue = issue({ id: 1, title: 'A', status: 'REPORTED', issueType: null,
                              createdAt: '2026-09-19T10:00:00.000Z', selectValues: { 10: ['LOW'] } });
    const withoutValue = issue({ id: 2, title: 'B', status: 'REPORTED', issueType: null,
                                 createdAt: '2026-09-19T11:00:00.000Z', selectValues: {} });
    assert.deepEqual(filterIssues([withValue, withoutValue], { selectValues: { 10: 'NONE' } }).map(i => i.id), [2]);
  });

  it('AND-combines multiple select-field filters', () => {
    const a = issue({ id: 1, title: 'A', status: 'REPORTED', issueType: null,
                      createdAt: '2026-09-19T10:00:00.000Z', selectValues: { 10: ['LOW'], 20: ['BUG'] } });
    const b = issue({ id: 2, title: 'B', status: 'REPORTED', issueType: null,
                      createdAt: '2026-09-19T11:00:00.000Z', selectValues: { 10: ['LOW'], 20: ['FEATURE'] } });
    const c = issue({ id: 3, title: 'C', status: 'REPORTED', issueType: null,
                      createdAt: '2026-09-19T12:00:00.000Z', selectValues: { 10: ['HIGH'], 20: ['BUG'] } });
    assert.deepEqual(filterIssues([a, b, c], { selectValues: { 10: ['LOW'], 20: ['BUG'] } }).map(i => i.id), [1]);
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
    deletedAt: null,
    archivedAt: null,
    selectValues: {},
    ...input
  };
}
