import { DOCUMENT } from '@angular/common';
import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs/operators';
import { clearTourSeen, hasSeenTour, markTourSeen } from '../../shared/tour-storage';
import type { CurrentUser } from '../../shared/models/auth.types';
import { TOUR_STEPS, TourDialogKind, TourRole, TourStep } from './tour-steps';

/**
 * Holds the tour state, drives step navigation, persists completion per
 * (user.id, user.role) and resolves the current target element for the overlay.
 *
 * The tour is purely demonstrative: it never triggers save actions, and the
 * overlay blocks pointer events on the rest of the app while it is active.
 */
@Injectable({ providedIn: 'root' })
export class TourService {
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);

  private readonly _active = signal(false);
  private readonly _stepIndex = signal(0);
  private readonly _user = signal<CurrentUser | null>(null);
  private readonly _targetRect = signal<DOMRect | null>(null);
  private readonly _dialogRequest = signal<TourDialogKind | null>(null);

  /** True while the tour is on screen. */
  readonly active = this._active.asReadonly();

  /** Zero-based index of the current step (already filtered by role). */
  readonly stepIndex = this._stepIndex.asReadonly();

  /** Steps visible to the current user. */
  readonly steps = computed<TourStep[]>(() => {
    const user = this._user();
    if (!user) return [];
    const role = user.role as TourRole;
    return TOUR_STEPS.filter(step => !step.roles || step.roles.includes(role));
  });

  /** Current step or null when the tour is idle. */
  readonly currentStep = computed<TourStep | null>(() => this.steps()[this._stepIndex()] ?? null);

  /** Total visible steps for the active user. */
  readonly totalSteps = computed(() => this.steps().length);

  /** Human-readable progress label, e.g. "3 / 10". */
  readonly progress = computed(() => {
    const total = this.totalSteps();
    if (total === 0) return '0 / 0';
    return `${this._stepIndex() + 1} / ${total}`;
  });

  /** True when the current step is the last one for the active user. */
  readonly isLastStep = computed(() => this._stepIndex() === this.totalSteps() - 1);

  /** Bounding rect of the highlighted target, refreshed by the overlay on scroll/resize. */
  readonly targetRect = this._targetRect.asReadonly();

  /**
   * The dialog the current step wants opened (create / detail). The home page
   * observes this signal, opens the matching dialog, then asks the tour to
   * re-measure the target so the cutout lands on an element inside the dialog.
   */
  readonly dialogRequest = this._dialogRequest.asReadonly();

  /**
   * Bumped on every navigation to invalidate in-flight target lookups. Lets
   * us cancel pending `setTimeout` retries when the user advances quickly.
   */
  private focusGeneration = 0;

  constructor() {
    // Drive navigation when the current step changes.
    effect(() => {
      const step = this.currentStep();
      if (!this._active() || !step) return;

      // Publish which dialog the host page should open. The home component
      // listens and opens it; we then re-query the target so the cutout lands
      // on the freshly-rendered dialog content.
      this._dialogRequest.set(step.openDialog ?? null);

      const url = this.router.url.split('?')[0].split('#')[0];
      if (url !== step.route) {
        void this.router.navigateByUrl(step.route);
      } else {
        // Same route: the dialog might have just opened (or the target may
        // have re-mounted), so give Angular a beat then re-query.
        setTimeout(() => this.focusStepTarget(step), 80);
      }
    });

    // After navigation completes, look up the target in the newly mounted view.
    this.router.events.pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe(() => {
        if (!this._active()) return;
        const step = this.currentStep();
        if (step && this.router.url.split('?')[0].split('#')[0] === step.route) {
          setTimeout(() => this.focusStepTarget(step), 80);
        }
      });
  }

  /**
   * Starts the tour automatically for a new USER or SUPERUSER who has not
   * completed it yet. No-op in every other case.
   */
  startIfNeeded(user: CurrentUser): void {
    if (this._active()) return;
    if (user.role !== 'USER' && user.role !== 'SUPERUSER') return;
    if (hasSeenTour(user)) return;
    this._user.set(user);
    this._stepIndex.set(0);
    this._active.set(true);
  }

  /** Move to the next step. On the last step this completes the tour. */
  next(): void {
    if (!this._active()) return;
    if (this.isLastStep()) {
      this.complete();
      return;
    }
    this._stepIndex.update(index => index + 1);
  }

  /** Move to the previous step. No-op on the first step. */
  previous(): void {
    if (!this._active()) return;
    if (this._stepIndex() === 0) return;
    this._stepIndex.update(index => index - 1);
  }

  /**
   * Skips the tour entirely. Marks the user as having seen it so it won't
   * auto-start again. Safe to call even when the tour is not active.
   */
  skip(): void {
    const user = this._user();
    if (user) markTourSeen(user);
    this.deactivate();
  }

  /**
   * Stops the tour WITHOUT marking it as seen. Used by logout so a user who
   * never finished the tour gets to see it again on next login.
   */
  cancel(): void {
    this.deactivate();
  }

  /**
   * Clears the localStorage flag for the given user so the tour will run
   * again on next login. Reserved for an explicit "restart" action.
   */
  reset(user: CurrentUser): void {
    clearTourSeen(user);
  }

  /**
   * Re-measures the current target. Called by the overlay on window resize
   * and scroll so the highlight tracks the underlying element.
   */
  refreshTargetRect(): void {
    const step = this.currentStep();
    if (!step) return;
    const el = this.document.querySelector<HTMLElement>(step.target);
    if (el) {
      this._targetRect.set(el.getBoundingClientRect());
    }
  }

  /**
   * Re-runs the retry loop to find the current target. Useful when the host
   * page has just rendered a dialog and the cutout should re-anchor on the
   * dialog content.
   */
  focusCurrentStep(): void {
    const step = this.currentStep();
    if (step) this.focusStepTarget(step);
  }

  private complete(): void {
    const user = this._user();
    if (user) markTourSeen(user);
    this.deactivate();
  }

  private deactivate(): void {
    this._active.set(false);
    this._targetRect.set(null);
    this._dialogRequest.set(null);
    this.focusGeneration++;
  }

  private focusStepTarget(step: TourStep): void {
    const generation = ++this.focusGeneration;
    const tryQuery = (retriesLeft: number): void => {
      if (generation !== this.focusGeneration) return;
      const el = this.document.querySelector<HTMLElement>(step.target);
      if (el) {
        this.applyTarget(el);
        return;
      }
      if (retriesLeft <= 0) {
        // eslint-disable-next-line no-console
        console.warn(`[Tour] target not found: ${step.target}`);
        this._targetRect.set(null);
        return;
      }
      setTimeout(() => tryQuery(retriesLeft - 1), 50);
    };
    requestAnimationFrame(() => tryQuery(20));
  }

  private applyTarget(el: HTMLElement): void {
    el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    setTimeout(() => this._targetRect.set(el.getBoundingClientRect()), 350);
  }
}
