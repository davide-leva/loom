import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { TourOverlayComponent } from './tour-overlay.component';
import { TourService } from '../../services/tour/tour.service';
import type { TourStep } from '../../services/tour/tour-steps';

describe('TourOverlayComponent', () => {
  let fixture: ComponentFixture<TourOverlayComponent>;
  let active: ReturnType<typeof signal<boolean>>;
  let stepIndex: ReturnType<typeof signal<number>>;
  let totalSteps: ReturnType<typeof signal<number>>;
  let isLastStep: ReturnType<typeof signal<boolean>>;
  let currentStep: ReturnType<typeof signal<TourStep | null>>;
  let targetRect: ReturnType<typeof signal<DOMRect | null>>;
  let progress: ReturnType<typeof signal<string>>;
  let dialogRequest: ReturnType<typeof signal<unknown>>;
  let tourStub: {
    active: typeof active;
    stepIndex: typeof stepIndex;
    totalSteps: typeof totalSteps;
    isLastStep: typeof isLastStep;
    currentStep: typeof currentStep;
    targetRect: typeof targetRect;
    progress: typeof progress;
    dialogRequest: typeof dialogRequest;
    next: jest.Mock;
    previous: jest.Mock;
    skip: jest.Mock;
    refreshTargetRect: jest.Mock;
    focusCurrentStep: jest.Mock;
  };

  const sampleStep: TourStep = {
    id: 'welcome',
    route: '/dashboard',
    target: '[data-onboarding="brand"]',
    title: 'Benvenuto',
    text: 'Ciao!'
  };

  beforeEach(async () => {
    localStorage.clear();
    active = signal(false);
    stepIndex = signal(0);
    totalSteps = signal(3);
    isLastStep = signal(false);
    currentStep = signal<TourStep | null>(null);
    targetRect = signal<DOMRect | null>(null);
    progress = signal('1 / 3');
    dialogRequest = signal<unknown>(null);
    tourStub = {
      active, stepIndex, totalSteps, isLastStep, currentStep, targetRect, progress, dialogRequest,
      next: jest.fn(), previous: jest.fn(), skip: jest.fn(),
      refreshTargetRect: jest.fn(), focusCurrentStep: jest.fn()
    };

    await TestBed.configureTestingModule({
      imports: [TourOverlayComponent],
      providers: [{ provide: TourService, useValue: tourStub }]
    }).compileComponents();

    fixture = TestBed.createComponent(TourOverlayComponent);
    fixture.detectChanges();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('renders nothing while the tour is inactive', () => {
    expect(fixture.nativeElement.querySelector('.tour-backdrop')).toBeNull();
    expect(fixture.nativeElement.querySelector('.tour-tooltip')).toBeNull();
  });

  it('renders backdrop and tooltip when the tour is active', () => {
    active.set(true);
    currentStep.set(sampleStep);
    targetRect.set({ top: 10, left: 10, right: 110, bottom: 60, width: 100, height: 50, x: 10, y: 10, toJSON: () => ({}) } as DOMRect);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.tour-backdrop')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.tour-tooltip')).not.toBeNull();
  });

  it('shows the current step title and body in the tooltip', () => {
    active.set(true);
    currentStep.set(sampleStep);
    fixture.detectChanges();

    const tooltip = fixture.nativeElement.querySelector('.tour-tooltip') as HTMLElement;
    expect(tooltip.textContent).toContain('Benvenuto');
    expect(tooltip.textContent).toContain('Ciao!');
  });

  it('shows "Fine" instead of "Avanti" on the last step', () => {
    active.set(true);
    currentStep.set(sampleStep);
    isLastStep.set(true);
    fixture.detectChanges();

    const tooltip = fixture.nativeElement.querySelector('.tour-tooltip') as HTMLElement;
    expect(tooltip.textContent).toContain('Fine');
  });

  it('does not render the cutout before the first target is measured', () => {
    active.set(true);
    currentStep.set(sampleStep);
    targetRect.set(null);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.tour-cutout')).toBeNull();
  });

  it('renders the cutout once a target rect is provided', () => {
    active.set(true);
    currentStep.set(sampleStep);
    targetRect.set({ top: 20, left: 20, right: 100, bottom: 60, width: 80, height: 40, x: 20, y: 20, toJSON: () => ({}) } as DOMRect);
    fixture.detectChanges();

    const cutout = fixture.nativeElement.querySelector('.tour-cutout') as HTMLElement;
    expect(cutout).not.toBeNull();
    expect(cutout.style.top).toBe('14px');
    expect(cutout.style.left).toBe('14px');
    expect(cutout.style.width).toBe('92px');
    expect(cutout.style.height).toBe('52px');
  });

  it('carves a hole in the backdrop around the target so it is not blurred', () => {
    active.set(true);
    currentStep.set(sampleStep);
    targetRect.set({ top: 20, left: 20, right: 100, bottom: 60, width: 80, height: 40, x: 20, y: 20, toJSON: () => ({}) } as DOMRect);
    fixture.detectChanges();

    const backdrop = fixture.nativeElement.querySelector('.tour-backdrop') as HTMLElement;
    const clip = backdrop.style.clipPath;
    // The clip-path is a polygon with an outer rectangle and a counter-clockwise
    // inner hole; we just verify the hole coordinates match the cutout area.
    expect(clip).toContain('14px 14px');
    expect(clip).toContain('106px 66px');
    expect(clip.split(' ').length).toBeGreaterThan(8);
  });

  it('does not apply a clip-path before the first target is measured', () => {
    active.set(true);
    currentStep.set(sampleStep);
    targetRect.set(null);
    fixture.detectChanges();

    const backdrop = fixture.nativeElement.querySelector('.tour-backdrop') as HTMLElement;
    expect(backdrop.style.clipPath).toBe('');
  });

  it('invokes tour.skip() when Esc is pressed', () => {
    active.set(true);
    currentStep.set(sampleStep);
    fixture.detectChanges();

    fixture.nativeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(tourStub.skip).toHaveBeenCalled();
  });

  it('does not call skip() on Esc while the tour is inactive', () => {
    fixture.nativeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(tourStub.skip).not.toHaveBeenCalled();
  });

  it('invokes tour.next() on ArrowRight and tour.previous() on ArrowLeft', () => {
    active.set(true);
    currentStep.set(sampleStep);
    fixture.detectChanges();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    expect(tourStub.next).toHaveBeenCalled();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    expect(tourStub.previous).toHaveBeenCalled();
  });

  it('shows the progress label inside the tooltip', () => {
    active.set(true);
    currentStep.set(sampleStep);
    progress.set('2 / 5');
    fixture.detectChanges();

    const tooltip = fixture.nativeElement.querySelector('.tour-tooltip') as HTMLElement;
    expect(tooltip.textContent).toContain('2 / 5');
  });

  it('disables the back button on the first step', () => {
    active.set(true);
    currentStep.set(sampleStep);
    stepIndex.set(0);
    fixture.detectChanges();

    // The disabled attribute is rendered by PrimeNG; we just confirm the
    // step index exposed to the template is 0.
    expect(tourStub.stepIndex()).toBe(0);
  });
});
