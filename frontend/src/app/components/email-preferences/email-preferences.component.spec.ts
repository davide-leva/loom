import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { Subject } from 'rxjs';
import { EmailPreferencesComponent } from './email-preferences.component';
import { EmailPreferencesService } from '../../services/email-preferences/email-preferences.service';
import type { EmailPreferences } from '../../services/email-preferences/email-preferences.service';

class EmailPrefsStub {
  get$ = new Subject<EmailPreferences>();
  get = jest.fn(() => this.get$.asObservable());
  update$ = new Subject<EmailPreferences>();
  update = jest.fn(() => this.update$.asObservable());
}

function prefs(partial: Partial<EmailPreferences>): EmailPreferences {
  return {
    globalWantEmail: null,
    projects: [],
    ...partial
  } as EmailPreferences;
}

describe('EmailPreferencesComponent', () => {
  let fixture: ComponentFixture<EmailPreferencesComponent>;
  let component: EmailPreferencesComponent;
  let api: EmailPrefsStub;

  beforeEach(async () => {
    api = new EmailPrefsStub();
    await TestBed.configureTestingModule({
      imports: [EmailPreferencesComponent],
      providers: [
        provideAnimationsAsync('noop'),
        { provide: EmailPreferencesService, useValue: api }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(EmailPreferencesComponent);
    component = fixture.componentInstance;
  });

  describe('options()', () => {
    it('contains Default, Si, No', () => {
      expect(component.options.map(o => o.label)).toEqual(['Default', 'Si', 'No']);
    });
  });

  describe('ngOnInit / load()', () => {
    it('loads preferences on init', () => {
      component.ngOnInit();
      expect(api.get).toHaveBeenCalled();
    });

    it('stores preferences on success', () => {
      component.ngOnInit();
      api.get$.next(prefs({ globalWantEmail: true, projects: [{ projectId: 1, projectName: 'P1', wantEmail: false }] }));
      expect(component.preferences?.globalWantEmail).toBe(true);
      expect(component.preferences?.projects.length).toBe(1);
      expect(component.loading).toBe(false);
    });

    it('sets error on failure', () => {
      component.ngOnInit();
      api.get$.error(new Error('boom'));
      expect(component.error).toBe('Non riesco a caricare le preferenze.');
      expect(component.loading).toBe(false);
    });
  });

  describe('save()', () => {
    beforeEach(() => {
      component.ngOnInit();
      api.get$.next(prefs({ globalWantEmail: true }));
    });

    it('does nothing when preferences is null', () => {
      component.preferences = null;
      component.save();
      expect(api.update).not.toHaveBeenCalled();
    });

    it('does nothing when already saving', () => {
      component.saving = true;
      component.save();
      expect(api.update).not.toHaveBeenCalled();
    });

    it('sends current preferences and updates on success', () => {
      component.preferences!.globalWantEmail = false;
      component.save();
      expect(api.update).toHaveBeenCalledWith(component.preferences);
      api.update$.next(prefs({ globalWantEmail: false }));
      expect(component.message).toBe('Preferenze salvate.');
      expect(component.saving).toBe(false);
    });

    it('sets error on failure', () => {
      component.save();
      api.update$.error(new Error('boom'));
      expect(component.error).toBe('Non riesco a salvare le preferenze.');
      expect(component.saving).toBe(false);
    });
  });
});