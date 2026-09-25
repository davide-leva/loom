import { DOCUMENT } from '@angular/common';
import { Component, DestroyRef, HostListener, computed, effect, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { fromEvent } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { TourService } from '../../services/tour/tour.service';

interface TourTooltipPosition {
  top: number;
  left: number;
}

const TOOLTIP_WIDTH = 380;
const TOOLTIP_HEIGHT = 200;
const TOOLTIP_MARGIN = 16;
const VIEWPORT_GUTTER = 16;
const CUTOUT_PADDING = 6;

/**
 * Renders the guided-tour overlay: a blurred backdrop with a clip-path hole
 * around the current target element, a border highlight on the target, and a
 * floating tooltip with the step description and navigation controls.
 *
 * The component is purely presentational — all tour state lives in
 * {@link TourService}.
 */
@Component({
  selector: 'app-tour-overlay',
  imports: [ButtonModule],
  template: `
    @if (tour.active()) {
      <div class="tour-backdrop" [style]="backdropStyle()" aria-hidden="true"></div>

      @if (cutoutStyle(); as style) {
        <div class="tour-cutout" [style]="style" aria-hidden="true"></div>
      }

      <section class="tour-tooltip" role="dialog" aria-modal="true"
               aria-labelledby="tour-tooltip-title"
               [style.top.px]="tooltipPosition().top"
               [style.left.px]="tooltipPosition().left">
        <div class="tour-tooltip__kicker">{{ tour.progress() }}</div>
        @if (tour.currentStep(); as step) {
          <h2 id="tour-tooltip-title">{{ step.title }}</h2>
          <p>{{ step.text }}</p>
        }
        <div class="tour-tooltip__actions">
          <p-button label="Salta" severity="secondary" [text]="true" (onClick)="tour.skip()" />
          <div class="tour-tooltip__step">
            <p-button icon="pi pi-arrow-left" severity="secondary" [outlined]="true"
                      [disabled]="tour.stepIndex() === 0" ariaLabel="Step precedente"
                      (onClick)="tour.previous()" />
            <p-button [label]="tour.isLastStep() ? 'Fine' : 'Avanti'"
                      icon="pi pi-arrow-right" iconPos="right"
                      (onClick)="tour.next()" />
          </div>
        </div>
      </section>
    }
  `,
  styles: [`
    .tour-backdrop {
      position: fixed;
      inset: 0;
      z-index: 1500;
      background: rgba(15, 23, 42, 0.55);
      backdrop-filter: blur(3px);
      -webkit-backdrop-filter: blur(3px);
      pointer-events: auto;
      /* clip-path is set inline to carve a hole around the highlighted target */
    }

    .tour-cutout {
      position: fixed;
      z-index: 1505;
      pointer-events: none;
      border: 3px solid var(--p-primary-400);
      border-radius: 10px;
      background: transparent;
      box-shadow: 0 12px 32px rgba(15, 23, 42, 0.35);
      transition: top 0.25s ease, left 0.25s ease, width 0.25s ease, height 0.25s ease;
    }

    .tour-tooltip {
      position: fixed;
      z-index: 1510;
      width: min(380px, calc(100vw - 32px));
      max-height: calc(100vh - 32px);
      overflow: auto;
      padding: 20px 22px;
      border: 1px solid #dbe2ea;
      border-radius: 12px;
      background: #fff;
      color: #1f2937;
      box-shadow: 0 24px 65px rgba(15, 23, 42, 0.32);
      pointer-events: auto;
    }

    .tour-tooltip__kicker {
      color: var(--p-primary-600);
      font-size: 12px;
      font-weight: 800;
      letter-spacing: 0.04em;
    }

    .tour-tooltip h2 {
      margin: 6px 0 8px;
      font-size: 18px;
      line-height: 1.25;
    }

    .tour-tooltip p {
      margin: 0;
      color: #4b5563;
      line-height: 1.5;
    }

    .tour-tooltip__actions {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-top: 16px;
    }

    .tour-tooltip__step {
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }

    @media (max-width: 560px) {
      .tour-tooltip {
        padding: 16px;
      }
      .tour-tooltip__actions {
        flex-direction: column;
        align-items: stretch;
      }
      .tour-tooltip__step {
        justify-content: space-between;
      }
    }
  `]
})
export class TourOverlayComponent {
  readonly tour = inject(TourService);
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);

  readonly cutoutStyle = computed<Record<string, string> | null>(() => {
    const rect = this.tour.targetRect();
    if (!rect) return null;
    return {
      top: `${Math.round(rect.top - CUTOUT_PADDING)}px`,
      left: `${Math.round(rect.left - CUTOUT_PADDING)}px`,
      width: `${Math.round(rect.width + CUTOUT_PADDING * 2)}px`,
      height: `${Math.round(rect.height + CUTOUT_PADDING * 2)}px`
    };
  });

  /**
   * Backdrop style. When a target is measured, carves a hole around it via
   * clip-path so the highlighted element stays crisp (un-blurred and
   * un-dimmed). Without a target the backdrop covers the full viewport.
   */
  readonly backdropStyle = computed<Record<string, string>>(() => {
    const rect = this.tour.targetRect();
    if (!rect) return { 'clip-path': '' };
    const vw = this.document.defaultView?.innerWidth ?? window.innerWidth;
    const vh = this.document.defaultView?.innerHeight ?? window.innerHeight;
    const top = this.clamp(Math.round(rect.top - CUTOUT_PADDING), 0, vh);
    const left = this.clamp(Math.round(rect.left - CUTOUT_PADDING), 0, vw);
    const right = this.clamp(Math.round(rect.right + CUTOUT_PADDING), 0, vw);
    const bottom = this.clamp(Math.round(rect.bottom + CUTOUT_PADDING), 0, vh);
    // Outer rectangle (clockwise) + inner hole (counter-clockwise) so the
    // area inside the cutout shows through un-blurred.
    return {
      'clip-path': `polygon(
        0% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 0%,
        ${left}px ${top}px, ${left}px ${bottom}px, ${right}px ${bottom}px, ${right}px ${top}px, ${left}px ${top}px
      )`
    };
  });

  readonly tooltipPosition = computed<TourTooltipPosition>(() => {
    const rect = this.tour.targetRect();
    if (!rect) {
      return this.centeredPosition();
    }
    return this.computePositionAround(rect);
  });

  constructor() {
    // Track the underlying element on scroll/resize so the highlight follows it.
    fromEvent<Event>(this.document.defaultView ?? window, 'resize')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.tour.refreshTargetRect());
    fromEvent<Event>(this.document.defaultView ?? window, 'scroll', { capture: true })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.tour.refreshTargetRect());

    // Block body scroll while the tour is active.
    effect(onCleanup => {
      if (this.tour.active()) {
        const previous = this.document.body.style.overflow;
        this.document.body.style.overflow = 'hidden';
        onCleanup(() => {
          this.document.body.style.overflow = previous;
        });
      }
    });
  }

  @HostListener('document:keydown', ['$event'])
  onKey(event: KeyboardEvent): void {
    if (!this.tour.active()) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      this.tour.skip();
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      this.tour.next();
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      this.tour.previous();
    }
  }

  private computePositionAround(rect: DOMRect): TourTooltipPosition {
    const vw = this.document.defaultView?.innerWidth ?? window.innerWidth;
    const vh = this.document.defaultView?.innerHeight ?? window.innerHeight;

    // Prefer placing below the target. Flip above if there isn't room.
    let top = rect.bottom + TOOLTIP_MARGIN;
    if (top + TOOLTIP_HEIGHT > vh - VIEWPORT_GUTTER) {
      top = rect.top - TOOLTIP_HEIGHT - TOOLTIP_MARGIN;
    }
    if (top < VIEWPORT_GUTTER) {
      top = VIEWPORT_GUTTER;
    }

    // Anchor to the target's left edge, but clamp inside the viewport.
    const width = Math.min(TOOLTIP_WIDTH, vw - VIEWPORT_GUTTER * 2);
    let left = rect.left;
    if (left + width > vw - VIEWPORT_GUTTER) {
      left = vw - width - VIEWPORT_GUTTER;
    }
    if (left < VIEWPORT_GUTTER) {
      left = VIEWPORT_GUTTER;
    }

    return { top, left };
  }

  private centeredPosition(): TourTooltipPosition {
    const vw = this.document.defaultView?.innerWidth ?? window.innerWidth;
    const vh = this.document.defaultView?.innerHeight ?? window.innerHeight;
    const width = Math.min(TOOLTIP_WIDTH, vw - VIEWPORT_GUTTER * 2);
    return {
      top: Math.max(VIEWPORT_GUTTER, (vh - TOOLTIP_HEIGHT) / 2),
      left: Math.max(VIEWPORT_GUTTER, (vw - width) / 2)
    };
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
  }
}
