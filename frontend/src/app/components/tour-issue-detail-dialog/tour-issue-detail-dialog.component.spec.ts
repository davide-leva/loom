import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { TourIssueDetailDialogComponent } from './tour-issue-detail-dialog.component';

describe('TourIssueDetailDialogComponent', () => {
  let fixture: ComponentFixture<TourIssueDetailDialogComponent>;
  let component: TourIssueDetailDialogComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TourIssueDetailDialogComponent],
      providers: [provideAnimationsAsync()]
    }).compileComponents();
    fixture = TestBed.createComponent(TourIssueDetailDialogComponent);
    component = fixture.componentInstance;
  });

  it('renders the demo issue header with title and status', () => {
    fixture.detectChanges();
    const header = fixture.nativeElement.querySelector('.dialog-title');
    expect(header?.textContent).toContain('Segnalazione #42');
    expect(header?.textContent).toContain('In lavorazione');
  });

  it('exposes the data-onboarding marker for the tour cutout', () => {
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-onboarding="issue-detail"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[data-onboarding="issue-comments"]')).not.toBeNull();
  });

  it('renders the demo comments', () => {
    fixture.detectChanges();
    const comments = fixture.nativeElement.querySelectorAll('.comment-item');
    expect(comments.length).toBe(2);
  });

  it('does not render any save/approve/archive/delete buttons', () => {
    fixture.detectChanges();
    const buttons = fixture.nativeElement.querySelectorAll('.azioni-segnalazione p-button');
    expect(buttons.length).toBe(0);
  });

  it('blocks the comment submit so the tour cannot create real data', () => {
    fixture.detectChanges();
    const event = new Event('submit');
    const preventDefaultSpy = jest.spyOn(event, 'preventDefault');
    component.onFakeSubmit(event);
    expect(preventDefaultSpy).toHaveBeenCalled();
  });

  it('emits closed through its public output', () => {
    fixture.detectChanges();
    const closedSpy = jest.fn();
    component.closed.subscribe(closedSpy);
    component.closed.emit();
    expect(closedSpy).toHaveBeenCalled();
  });
});
