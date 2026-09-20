import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { signal } from '@angular/core';
import { Subject } from 'rxjs';
import { EventsComponent } from './events.component';
import { EventsService } from '../../services/events/events.service';
import { ProjectContextService } from '../../services/project-context/project-context.service';
import { LiveSyncService } from '../../services/live-sync/live-sync.service';
import type { EventActor, EventPage, EventType, WorkspaceEvent } from '../../shared/models/event.types';

class EventsStub {
  list$ = new Subject<EventPage>();
  list = jest.fn(() => this.list$.asObservable());
  actors$ = new Subject<EventActor[]>();
  actors = jest.fn(() => this.actors$.asObservable());

  newListStream(): void { this.list$ = new Subject<EventPage>(); }
  newActorsStream(): void { this.actors$ = new Subject<EventActor[]>(); }
}

function event(partial: Partial<WorkspaceEvent>): WorkspaceEvent {
  return {
    id: 1, projectId: 1, type: 'ISSUE_CREATED', actorId: 1, actorUsername: 'mario',
    issueId: 10, issueTitle: 'Title', data: 'something', internal: false,
    eventDate: '2026-09-19T08:00:00.000Z',
    ...partial
  } as WorkspaceEvent;
}

describe('EventsComponent', () => {
  let fixture: ComponentFixture<EventsComponent>;
  let component: EventsComponent;
  let api: EventsStub;
  let currentProjectIdSignal: ReturnType<typeof signal<number | null>>;
  let revisionSignal: ReturnType<typeof signal<number>>;

  beforeEach(async () => {
    api = new EventsStub();
    currentProjectIdSignal = signal<number | null>(null);
    revisionSignal = signal(0);

    await TestBed.configureTestingModule({
      imports: [EventsComponent],
      providers: [
        provideAnimationsAsync('noop'),
        { provide: EventsService, useValue: api },
        { provide: ProjectContextService, useValue: { currentProjectId: () => currentProjectIdSignal(), currentProject: () => null } },
        { provide: LiveSyncService, useValue: { revision: () => revisionSignal() } }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(EventsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  describe('actorOptions() and icon()', () => {
    it('actorOptions() prepends Tutti to actors', () => {
      component.actors.set([{ id: 1, username: 'mario' }, { id: 2, username: 'anna' }]);
      const opts = component.actorOptions();
      expect(opts[0]).toEqual({ label: 'Tutti', value: null });
      expect(opts[1]).toEqual({ label: 'mario', value: 1 });
      expect(opts[2]).toEqual({ label: 'anna', value: 2 });
    });

    it('icon() returns expected class for known types', () => {
      expect(component.icon('ISSUE_DELETED')).toBe('pi pi-trash');
      expect(component.icon('ISSUE_COMMENT_DELETED')).toBe('pi pi-trash');
      expect(component.icon('ISSUE_COMMENT_ADDED')).toBe('pi pi-comment');
      expect(component.icon('ISSUE_ATTACHMENT_UPLOADED')).toBe('pi pi-paperclip');
      expect(component.icon('ISSUE_CREATED')).toBe('pi pi-plus');
      expect(component.icon('ISSUE_STATUS_CHANGED')).toBe('pi pi-pencil');
    });
  });

  describe('clearFilters()', () => {
    beforeEach(() => {
      currentProjectIdSignal.set(5);
      fixture.detectChanges();
      api.list$.next({ items: [], total: 0 });
      api.list$.complete();
      api.list.mockClear();
    });

    it('resets filters and reloads', () => {
      component.type = 'ISSUE_CREATED' as EventType;
      component.actorId = 5;
      component.dateRange = [new Date(), new Date()];
      component.page.set(2);
      component.clearFilters();
      expect(component.type).toBeNull();
      expect(component.actorId).toBeNull();
      expect(component.dateRange).toBeNull();
      expect(component.page()).toBe(0);
      expect(api.list).toHaveBeenCalled();
    });

    it('does not reload when reload=false', () => {
      component.clearFilters(false);
      expect(api.list).not.toHaveBeenCalled();
    });
  });

  describe('applyFilters() and goToPage()', () => {
    beforeEach(() => {
      currentProjectIdSignal.set(5);
      fixture.detectChanges();
      api.list$.next({ items: [], total: 0 });
      api.list$.complete();
      api.list.mockClear();
    });

    it('applyFilters() resets page and reloads', () => {
      component.page.set(3);
      component.applyFilters();
      expect(component.page()).toBe(0);
      expect(api.list).toHaveBeenCalled();
    });

    it('goToPage() sets page and reloads', () => {
      component.goToPage(2);
      expect(component.page()).toBe(2);
      expect(api.list).toHaveBeenCalled();
    });
  });

  describe('load()', () => {
    it('does nothing when no project', () => {
      expect(api.list).not.toHaveBeenCalled();
    });

    it('stores items and total on success', () => {
      currentProjectIdSignal.set(5);
      fixture.detectChanges();
      api.list$.next({ items: [event({ id: 1 })], total: 30 });
      api.list$.complete();
      expect(component.items().length).toBe(1);
      expect(component.total()).toBe(30);
      expect(component.loading()).toBe(false);
    });

    it('maps filters: passes type and actorId when set, omits when null', () => {
      currentProjectIdSignal.set(5);
      fixture.detectChanges();
      api.list$.next({ items: [], total: 0 });
      api.list$.complete();

      api.newListStream();
      component.type = 'ISSUE_CREATED' as EventType;
      component.actorId = 7;
      revisionSignal.set(1);
      fixture.detectChanges();
      api.list$.next({ items: [], total: 0 });
      api.list$.complete();
      const filters = api.list.mock.calls[api.list.mock.calls.length - 1][1];
      expect(filters.type).toBe('ISSUE_CREATED');
      expect(filters.actorId).toBe(7);
      expect(filters.page).toBe(0);
      expect(filters.size).toBe(25);
    });

    it('converts date range to ISO from/to timestamps', () => {
      currentProjectIdSignal.set(5);
      fixture.detectChanges();
      api.list$.next({ items: [], total: 0 });
      api.list$.complete();

      api.newListStream();
      const start = new Date(2026, 8, 1, 13, 0);
      const end = new Date(2026, 8, 30, 9, 0);
      component.dateRange = [start, end];
      revisionSignal.set(1);
      fixture.detectChanges();
      api.list$.next({ items: [], total: 0 });
      api.list$.complete();
      const filters = api.list.mock.calls[api.list.mock.calls.length - 1][1];
      expect(filters.from).toBeDefined();
      expect(filters.to).toBeDefined();
      expect(new Date(filters.from!).getTime()).toBe(new Date(2026, 8, 1).getTime());
      // end-of-day + 1 day: Sept 30 becomes Oct 1
      expect(new Date(filters.to!).getMonth()).toBe(9);
    });

    it('sets error on failure', () => {
      currentProjectIdSignal.set(5);
      fixture.detectChanges();
      api.list$.error(new Error('boom'));
      expect(component.error()).toBe('Non riesco a caricare gli eventi.');
      expect(component.loading()).toBe(false);
    });

    it('discards stale response when requestId changes', () => {
      currentProjectIdSignal.set(5);
      fixture.detectChanges();
      api.list$.next({ items: [event({ id: 1 })], total: 1 });
      // Trigger another load: revision or page change
      component.goToPage(1);
      api.list$.next({ items: [event({ id: 99 })], total: 1 });
      api.list$.complete();
      // The newer result should win
      expect(component.items()[0].id).toBe(99);
    });
  });

  describe('actors on project change', () => {
    it('loads actors when project is set', () => {
      currentProjectIdSignal.set(7);
      fixture.detectChanges();
      api.actors$.next([{ id: 1, username: 'mario' }]);
      api.actors$.complete();
      expect(component.actors().length).toBe(1);
    });

    it('handles actors error silently', () => {
      currentProjectIdSignal.set(7);
      fixture.detectChanges();
      api.actors$.error(new Error('boom'));
      expect(component.actors()).toEqual([]);
    });
  });
});