// Event domain types extracted from events.service.ts.

export type EventType = 'ISSUE_CREATED' | 'ISSUE_PLANNED' | 'ISSUE_STATUS_CHANGED' | 'ISSUE_APPROVED'
  | 'ISSUE_COMMENT_ADDED' | 'ISSUE_COMMENT_DELETED' | 'ISSUE_ATTACHMENT_UPLOADED'
  | 'ISSUE_VALUES_CHANGED' | 'ISSUE_DELETED';

export interface WorkspaceEvent {
  id: number;
  eventDate: string;
  type: EventType;
  data: string;
  issueId: number | null;
  issueTitle: string | null;
  internal: boolean;
  actorId: number | null;
  actorUsername: string | null;
}

export interface EventPage {
  items: WorkspaceEvent[];
  total: number;
}

export interface EventActor {
  id: number;
  username: string;
}

export interface EventFilters {
  page: number;
  size: number;
  type?: EventType;
  actorId?: number;
  from?: string;
  to?: string;
}