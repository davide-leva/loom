import type { CurrentUser } from './models/auth.types';

const PREFIX = 'loom-tour-seen';

export function tourStorageKey(user: CurrentUser): string {
  return `${PREFIX}:${user.id}:${user.role}`;
}

export function hasSeenTour(user: CurrentUser, storage: Storage = localStorage): boolean {
  return storage.getItem(tourStorageKey(user)) === '1';
}

export function markTourSeen(user: CurrentUser, storage: Storage = localStorage): void {
  storage.setItem(tourStorageKey(user), '1');
}

export function clearTourSeen(user: CurrentUser, storage: Storage = localStorage): void {
  storage.removeItem(tourStorageKey(user));
}
