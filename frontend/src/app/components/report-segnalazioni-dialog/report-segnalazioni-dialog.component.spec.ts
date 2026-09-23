import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { Subject } from 'rxjs';
import { ReportSegnalazioniDialogComponent } from './report-segnalazioni-dialog.component';
import { SegnalazioniService } from '../../services/segnalazioni/segnalazioni.service';
import { AuthService } from '../../services/auth/auth.service';
import type { CurrentUser } from '../../shared/models/auth.types';
import type { ProjectUserSummary } from '../../shared/models/segnalazione.types';

class SegnalazioniStub {
  report$ = new Subject<Blob>();
  scaricaReportSegnalazioni = jest.fn(() => this.report$.asObservable());
}

function userOf(role: string): CurrentUser {
  return { id: 1, username: 'mario', displayName: 'Mario', email: 'm@e.com',
    role, companyName: 'Acme', companyId: 10, primaryColor: 'blue',
    companyLogoUrl: null, internalCompanyName: 'Loom', internalLogoUrl: null } as CurrentUser;
}

describe('ReportSegnalazioniDialogComponent', () => {
  let fixture: ComponentFixture<ReportSegnalazioniDialogComponent>;
  let component: ReportSegnalazioniDialogComponent;
  let segnalazioniApi: SegnalazioniStub;
  let userSignal: CurrentUser | null;

  const users: ProjectUserSummary[] = [
    { id: 1, username: 'mario', firstName: 'Mario', lastName: 'Rossi', role: 'TEAM' },
    { id: 2, username: 'anna', firstName: null, lastName: null, role: 'USER' }
  ];

  beforeEach(async () => {
    segnalazioniApi = new SegnalazioniStub();
    userSignal = userOf('USER');

    await TestBed.configureTestingModule({
      imports: [ReportSegnalazioniDialogComponent],
      providers: [
        provideAnimationsAsync('noop'),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: SegnalazioniService, useValue: segnalazioniApi },
        { provide: AuthService, useValue: { user: () => userSignal } }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(ReportSegnalazioniDialogComponent);
    component = fixture.componentInstance;
    component.projectId = 7;
    component.users = users;
  });

  afterEach(() => {
    fixture.destroy();
  });

  describe('options', () => {
    it('issuerOptions() includes Tutti, Non assegnato, then all users', () => {
      const opts = component.issuerOptions();
      expect(opts[0]).toEqual({ label: 'Tutti', value: 'ALL' });
      expect(opts[1]).toEqual({ label: 'Non assegnato', value: 'NONE' });
      expect(opts.length).toBe(4);
      // Expect "Mario Rossi (mario)" for users with names
      expect(opts.find(o => o.value === 1)?.label).toBe('Mario Rossi (mario)');
      expect(opts.find(o => o.value === 2)?.label).toBe('anna');
    });

    it('developerOptions() filters users by TEAM role', () => {
      const opts = component.developerOptions();
      const values = opts.map(o => o.value);
      expect(values).toContain('ALL');
      expect(values).toContain('NONE');
      expect(values).toContain(1);
      expect(values).not.toContain(2);
    });

    it('canSeeVisibility(): ADMIN/TEAM see it, USER/SUPERUSER do not', () => {
      userSignal = userOf('USER');
      expect(component.canSeeVisibility()).toBe(false);
      userSignal = userOf('SUPERUSER');
      expect(component.canSeeVisibility()).toBe(false);
      userSignal = userOf('ADMIN');
      expect(component.canSeeVisibility()).toBe(true);
      userSignal = userOf('TEAM');
      expect(component.canSeeVisibility()).toBe(true);
    });
  });

  describe('generate()', () => {
    it('does nothing when projectId is null', () => {
      component.projectId = null;
      component.generate();
      expect(segnalazioniApi.scaricaReportSegnalazioni).not.toHaveBeenCalled();
    });

    it('passes ALL filters through and skips empty fields', () => {
      component.search = 'login bug';
      component.status = 'REPORTED';
      component.type = 'ANOMALY';
      component.issuer = 7;
      component.developer = 20;
      component.dateRange = [new Date(2026, 8, 1), new Date(2026, 8, 30)]; // Sept 1 - Sept 30
      userSignal = userOf('ADMIN');
      component.visibility = 'INTERNAL';

      component.generate();

      const filters = segnalazioniApi.scaricaReportSegnalazioni.mock.calls[0][1];
      expect(filters.search).toBe('login bug');
      expect(filters.status).toBe('REPORTED');
      expect(filters.issueType).toBe('ANOMALY');
      expect(filters.issuerId).toBe(7);
      expect(filters.developerId).toBe(20);
      expect(filters.from).toBeDefined();
      expect(filters.to).toBeDefined();
      expect(new Date(filters.from).getTime()).toBeLessThan(new Date(filters.to).getTime());
      expect(filters.internal).toBe(true);
    });

    it('omits "ALL" and converts NONE to uncategorized', () => {
      component.type = 'NONE';
      component.issuer = 'NONE';
      component.developer = 'NONE';

      component.generate();

      const filters = segnalazioniApi.scaricaReportSegnalazioni.mock.calls[0][1];
      expect(filters.issueType).toBeUndefined();
      expect(filters.uncategorized).toBe(true);
      expect(filters.issuerId).toBeUndefined();
      expect(filters.issuerUnassigned).toBe(true);
      expect(filters.developerUnassigned).toBe(true);
    });

    it('does not include internal flag for non-internal users', () => {
      userSignal = userOf('USER');
      component.visibility = 'INTERNAL';

      component.generate();

      const filters = segnalazioniApi.scaricaReportSegnalazioni.mock.calls[0][1];
      expect(filters.internal).toBeUndefined();
    });

    it('saves blob with project id filename and closes dialog on success', () => {
      const closeSpy = jest.fn();
      component.closed.subscribe(closeSpy);
      const saveSpy = jest.spyOn(component as any, 'save').mockImplementation(() => undefined);

      component.generate();
      segnalazioniApi.report$.next(new Blob(['x']));

      expect(saveSpy).toHaveBeenCalledWith(expect.any(Blob), 'report-segnalazioni-7.pdf');
      expect(closeSpy).toHaveBeenCalled();
      expect(component.generating).toBe(false);
    });

    it('sets error and stops generating on failure', () => {
      component.generate();
      segnalazioniApi.report$.error(new Error('boom'));
      expect(component.error).toBe('Non riesco a generare il report PDF.');
      expect(component.generating).toBe(false);
    });

    it('trims search and treats empty as undefined', () => {
      component.search = '   ';
      component.generate();
      expect(segnalazioniApi.scaricaReportSegnalazioni.mock.calls[0][1].search).toBeUndefined();
    });
  });

  describe('close()', () => {
    it('emits closed and sets visible=false', () => {
      const closeSpy = jest.fn();
      component.closed.subscribe(closeSpy);
      component.close();
      expect(component.visible).toBe(false);
      expect(closeSpy).toHaveBeenCalled();
    });
  });
});