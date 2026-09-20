// Live sync domain types extracted from live-sync.service.ts.

export interface LiveMessage {
  kind: 'ready' | 'changed' | 'heartbeat';
  issueId?: number;
}