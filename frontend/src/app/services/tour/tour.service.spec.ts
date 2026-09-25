import { TestBed, discardPeriodicTasks, fakeAsync, tick } from '@angular/core/testing';
import { NavigationEnd, Router, provideRouter } from '@angular/router';
import { Subject } from 'rxjs';
import { TourService } from './tour.service';
import { TOUR_STEPS } from './tour-steps';
import type { CurrentUser } from '../../shared/models/auth.types';

const flushEffects = () => tick(0);

const USER_BASE: CurrentUser = {
  id: 42, username: 'mario', displayName: 'Mario', email: 'm@e.com',
  role: 'USER', companyName: 'Acme', companyId: 10, primaryColor: 'blue',
  companyLogoUrl: null, internalCompanyName: 'Loom', internalLogoUrl: null
};
const SUPERUSER: CurrentUser = { ...USER_BASE, id: 43, username: 'super', role: 'SUPERUSER' };
const ADMIN: CurrentUser = { ...USER_BASE, id: 44, username: 'admin', role: 'ADMIN' };
const TEAM: CurrentUser = { ...USER_BASE, id: 45, username: 'team', role: 'TEAM' };

function makeRect(): DOMRect {
  return { top: 10, left: 10, right: 110, bottom: 60, width: 100, height: 50, x: 10, y: 10, toJSON: () => ({}) } as DOMRect;
}

describe('TourService', () => {
  let service: TourService;
  let router: Router;
  let events$: Subject<unknown>;

  beforeEach(() => {
    localStorage.clear();
    events$ = new Subject();
    TestBed.configureTestingModule({
      providers: [provideRouter([])]
    });
    router = TestBed.inject(Router);
    jest.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    jest.spyOn(router, 'events', 'get').mockReturnValue(events$ as never);
    service = TestBed.inject(TourService);
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('startIfNeeded()', () => {
    it('activates the tour for a USER that has not seen it yet', () => {
      service.startIfNeeded(USER_BASE);
      expect(service.active()).toBe(true);
      expect(service.totalSteps()).toBeGreaterThan(0);
      expect(service.stepIndex()).toBe(0);
    });

    it('activates the tour for a SUPERUSER', () => {
      service.startIfNeeded(SUPERUSER);
      expect(service.active()).toBe(true);
    });

    it('does NOT activate for ADMIN', () => {
      service.startIfNeeded(ADMIN);
      expect(service.active()).toBe(false);
    });

    it('does NOT activate for TEAM', () => {
      service.startIfNeeded(TEAM);
      expect(service.active()).toBe(false);
    });

    it('does NOT activate when the user has already seen the tour', () => {
      localStorage.setItem(`loom-tour-seen:${USER_BASE.id}:USER`, '1');
      service.startIfNeeded(USER_BASE);
      expect(service.active()).toBe(false);
    });

    it('is a no-op when called twice for the same user', () => {
      service.startIfNeeded(USER_BASE);
      service.startIfNeeded(USER_BASE);
      expect(service.stepIndex()).toBe(0);
    });

    it('filters out SUPERUSER-only steps for USER', () => {
      service.startIfNeeded(USER_BASE);
      const stepIds = service.steps().map(step => step.id);
      expect(stepIds).not.toContain('approve-column');
    });

    it('keeps SUPERUSER-only steps for SUPERUSER', () => {
      service.startIfNeeded(SUPERUSER);
      const stepIds = service.steps().map(step => step.id);
      expect(stepIds).toContain('approve-column');
    });
  });

  describe('navigation', () => {
    it('exposes the first step route when the tour starts', fakeAsync(() => {
      service.startIfNeeded(USER_BASE);
      tick();
      expect(service.active()).toBe(true);
      expect(service.currentStep()?.route).toBe(service.steps()[0].route);
      discardPeriodicTasks();
    }));

    it('focuses the target after NavigationEnd on the matching route', fakeAsync(() => {
      const target = document.createElement('div');
      target.setAttribute('data-onboarding', 'brand');
      // scrollIntoView may be missing on plain jsdom nodes; stub it so the
      // service can call it without throwing.
      (target as HTMLElement).scrollIntoView = jest.fn();
      document.body.appendChild(target);
      const rectSpy = jest.spyOn(target, 'getBoundingClientRect').mockReturnValue(makeRect());

      // Pretend the router is already on the first step's route, so the
      // NavigationEnd subscriber will accept the event without needing a real
      // navigation (which is mocked in beforeEach).
      const urlSpy = jest.spyOn(router, 'url', 'get').mockReturnValue('/dashboard');

      service.startIfNeeded(USER_BASE);
      tick();
      events$.next(new NavigationEnd(0, '/dashboard', '/dashboard'));
      tick(600);

      expect(service.targetRect()).not.toBeNull();
      target.remove();
      rectSpy.mockRestore();
      urlSpy.mockRestore();
      discardPeriodicTasks();
    }));

    it('publishes a dialogRequest when the current step opens a dialog', fakeAsync(() => {
      service.startIfNeeded(USER_BASE);
      tick(100);
      const issueDetail = service.steps().find(step => step.id === 'issue-detail');
      expect(issueDetail?.openDialog).toBe('detail');

      service.next();
      service.next();
      service.next();
      TestBed.flushEffects();
      tick(100);
      expect(service.currentStep()?.id).toBe('issue-detail');
      expect(service.dialogRequest()).toBe('detail');
      discardPeriodicTasks();
    }));

    it('clears the dialogRequest when the tour is skipped', fakeAsync(() => {
      service.startIfNeeded(USER_BASE);
      tick(100);
      service.next();
      service.next();
      service.next();
      TestBed.flushEffects();
      tick(100);
      expect(service.dialogRequest()).toBe('detail');
      service.skip();
      expect(service.dialogRequest()).toBeNull();
      discardPeriodicTasks();
    }));
  });

  describe('next() / previous() / skip()', () => {
    beforeEach(() => {
      service.startIfNeeded(USER_BASE);
    });

    it('next() advances the step index', () => {
      service.next();
      expect(service.stepIndex()).toBe(1);
    });

    it('previous() goes back one step', () => {
      service.next();
      service.previous();
      expect(service.stepIndex()).toBe(0);
    });

    it('previous() is a no-op on the first step', () => {
      service.previous();
      expect(service.stepIndex()).toBe(0);
    });

    it('next() on the last step deactivates and marks the tour as seen', () => {
      const total = service.totalSteps();
      for (let i = 0; i < total; i++) service.next();
      expect(service.active()).toBe(false);
      expect(localStorage.getItem(`loom-tour-seen:${USER_BASE.id}:USER`)).toBe('1');
    });

    it('skip() deactivates and marks the tour as seen', () => {
      service.skip();
      expect(service.active()).toBe(false);
      expect(localStorage.getItem(`loom-tour-seen:${USER_BASE.id}:USER`)).toBe('1');
    });

    it('next() and previous() are no-ops when the tour is not active', () => {
      service.skip();
      const indexBefore = service.stepIndex();
      service.next();
      service.previous();
      expect(service.stepIndex()).toBe(indexBefore);
    });
  });

  describe('cancel() / reset()', () => {
    it('cancel() stops the tour without marking it as seen', () => {
      service.startIfNeeded(USER_BASE);
      service.cancel();
      expect(service.active()).toBe(false);
      expect(localStorage.getItem(`loom-tour-seen:${USER_BASE.id}:USER`)).toBeNull();
    });

    it('reset() removes the seen flag so the tour can run again', () => {
      service.startIfNeeded(USER_BASE);
      service.skip();
      service.reset(USER_BASE);
      expect(localStorage.getItem(`loom-tour-seen:${USER_BASE.id}:USER`)).toBeNull();
    });
  });

  describe('progress', () => {
    it('exposes a "N / total" label while the tour is active', () => {
      service.startIfNeeded(USER_BASE);
      const total = service.totalSteps();
      expect(service.progress()).toBe(`1 / ${total}`);
      service.next();
      expect(service.progress()).toBe(`2 / ${total}`);
    });

    it('isLastStep() is true only on the last step', () => {
      service.startIfNeeded(USER_BASE);
      const total = service.totalSteps();
      for (let i = 0; i < total - 1; i++) {
        expect(service.isLastStep()).toBe(false);
        service.next();
      }
      expect(service.isLastStep()).toBe(true);
    });
  });

  describe('sanity checks on step definitions', () => {
    it('every step has a non-empty target selector', () => {
      for (const step of TOUR_STEPS) {
        expect(step.target.trim().length).toBeGreaterThan(0);
      }
    });

    it('every step has a unique id', () => {
      const ids = new Set<string>();
      for (const step of TOUR_STEPS) {
        expect(ids.has(step.id)).toBe(false);
        ids.add(step.id);
      }
    });
  });
});
