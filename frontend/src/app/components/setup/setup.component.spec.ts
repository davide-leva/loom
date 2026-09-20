import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { Subject } from 'rxjs';
import { SetupComponent } from './setup.component';
import { SetupService } from '../../services/setup/setup.service';
import type { SetupStatus } from '../../shared/models/setup.types';

class SetupStub {
  status$ = new Subject<SetupStatus>();
  status = jest.fn(() => this.status$.asObservable());
  setup$ = new Subject<void>();
  setup = jest.fn(() => this.setup$.asObservable());
}

describe('SetupComponent', () => {
  let fixture: ComponentFixture<SetupComponent>;
  let component: SetupComponent;
  let http: HttpTestingController;
  let router: Router;
  let setup: SetupStub;

  beforeEach(async () => {
    setup = new SetupStub();

    await TestBed.configureTestingModule({
      imports: [SetupComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: SetupService, useValue: setup }
      ]
    }).compileComponents();

    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    fixture = TestBed.createComponent(SetupComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    http.verify();
    jest.clearAllMocks();
  });

  function init(status: SetupStatus): void {
    fixture.detectChanges();
    setup.status$.next(status);
  }

  it('redirects to /login when setup is not required', () => {
    const navigateSpy = jest.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    init({ required: false });
    expect(navigateSpy).toHaveBeenCalledWith('/login');
  });

  it('stays on /setup when setup is required', () => {
    const navigateSpy = jest.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    init({ required: true });
    expect(navigateSpy).not.toHaveBeenCalled();
  });

  it('save() ignores when already saving', () => {
    init({ required: true });
    component.saving = true;
    component.save();
    expect(setup.setup).not.toHaveBeenCalled();
  });

  it('save() trims whitespace from fields', () => {
    init({ required: true });
    component.draft.teamCompanyName = '  Acme  ';
    component.draft.username = '  admin  ';
    component.draft.email = '  a@b.com  ';
    component.draft.password = 'longenough';

    component.save();

    const sent = setup.setup.mock.calls[0][0];
    expect(sent.teamCompanyName).toBe('Acme');
    expect(sent.username).toBe('admin');
    expect(sent.email).toBe('a@b.com');
    setup.setup$.next();
  });

  it('save() passes logo file when provided', () => {
    init({ required: true });
    const file = new File(['logo'], 'logo.png', { type: 'image/png' });
    component.logo = file;
    component.draft.username = 'admin';
    component.draft.password = 'longenough';

    component.save();

    expect(setup.setup.mock.calls[0][1]).toBe(file);
    setup.setup$.next();
  });

  it('save() submits FormData and navigates to /login on success', () => {
    const navigateSpy = jest.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    init({ required: true });

    component.draft.teamCompanyName = 'Acme';
    component.draft.primaryColor = 'blue';
    component.draft.username = 'admin';
    component.draft.email = 'admin@e.com';
    component.draft.password = 'longenough';
    component.draft.firstName = 'Mario';
    component.draft.lastName = 'Rossi';

    component.save();

    expect(setup.setup).toHaveBeenCalled();
    const callArgs = setup.setup.mock.calls[0];
    expect(callArgs[0]).toEqual({
      teamCompanyName: 'Acme',
      primaryColor: 'blue',
      username: 'admin',
      email: 'admin@e.com',
      password: 'longenough',
      firstName: 'Mario',
      lastName: 'Rossi'
    });

    setup.setup$.next();
    expect(navigateSpy).toHaveBeenCalledWith('/login');
  });

  it('save() sends null first/last when blank', () => {
    init({ required: true });

    component.draft.username = 'admin';
    component.draft.password = 'longenough';
    component.draft.teamCompanyName = 'Acme';
    component.draft.email = 'a@b.com';
    component.draft.firstName = '   ';
    component.draft.lastName = '';

    component.save();

    expect(setup.setup.mock.calls[0][0]).toEqual(expect.objectContaining({
      firstName: null,
      lastName: null
    }));
    setup.setup$.next();
  });

  it('save() sets error on 409 (already configured)', () => {
    init({ required: true });
    component.draft.username = 'admin';
    component.draft.password = 'longenough';

    component.save();

    setup.setup$.error(new HttpErrorResponse({ status: 409, statusText: 'Conflict' }));
    expect(component.error).toBe('Configurazione già completata.');
    expect(component.saving).toBe(false);
  });

  it('save() sets generic error on non-409 failure', () => {
    init({ required: true });
    component.draft.username = 'admin';
    component.draft.password = 'longenough';

    component.save();

    setup.setup$.error(new HttpErrorResponse({ status: 500, statusText: 'Server Error' }));
    expect(component.error).toBe('Non riesco a creare la configurazione iniziale.');
    expect(component.saving).toBe(false);
  });

  it('selectLogo() stores the selected file', () => {
    init({ required: true });
    const file = new File(['logo'], 'logo.png', { type: 'image/png' });
    component.selectLogo({ currentFiles: [file] } as any);
    expect(component.logo).toBe(file);
  });

  it('selectLogo() picks the last file when several are passed', () => {
    init({ required: true });
    const a = new File(['a'], 'a.png', { type: 'image/png' });
    const b = new File(['b'], 'b.png', { type: 'image/png' });
    component.selectLogo({ currentFiles: [a, b] } as any);
    expect(component.logo).toBe(b);
  });
});