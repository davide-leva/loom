import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap, Router, provideRouter } from '@angular/router';
import { Location } from '@angular/common';
import { Subject } from 'rxjs';
import { LoginComponent } from './login.component';
import { AuthService } from '../../services/auth/auth.service';
import { ProjectContextService } from '../../services/project-context/project-context.service';
import { SetupService } from '../../services/setup/setup.service';
import type { CurrentUser } from '../../shared/models/auth.types';

class AuthStub {
  user: CurrentUser | null = null;
  login$ = new Subject<CurrentUser>();
  external$ = new Subject<number>();
  login = jest.fn(() => this.login$.asObservable());
  loginExternal = jest.fn(() => this.external$.asObservable());
}

class ProjectContextStub {
  rememberExternalProject = jest.fn();
}

class SetupStub {
  status$ = new Subject<{ required: boolean }>();
  status = jest.fn(() => this.status$.asObservable());
}

describe('LoginComponent', () => {
  let fixture: ComponentFixture<LoginComponent>;
  let component: LoginComponent;
  let http: HttpTestingController;
  let router: Router;
  let auth: AuthStub;
  let projectContext: ProjectContextStub;
  let setup: SetupStub;
  let locationReplaceState: jest.Mock;
  let queryParamMap: Record<string, string>;

  const user: CurrentUser = {
    id: 1, username: 'mario', displayName: 'Mario', email: 'm@e.com',
    role: 'ADMIN', companyName: 'Acme', companyId: 10, primaryColor: 'blue',
    companyLogoUrl: null, internalCompanyName: 'Tickets', internalLogoUrl: null
  };

  beforeEach(async () => {
    sessionStorage.clear();
    auth = new AuthStub();
    projectContext = new ProjectContextStub();
    setup = new SetupStub();
    locationReplaceState = jest.fn();
    queryParamMap = {};

    await TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: auth },
        { provide: ProjectContextService, useValue: projectContext },
        { provide: SetupService, useValue: setup },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              get queryParamMap() { return convertToParamMap(queryParamMap); }
            }
          }
        },
        { provide: Location, useValue: { replaceState: locationReplaceState } }
      ]
    }).compileComponents();

    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    fixture = TestBed.createComponent(LoginComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    http.verify();
    sessionStorage.clear();
    jest.clearAllMocks();
  });

  function flushBranding(): void {
    const req = http.expectOne('/api/branding/internal');
    req.flush({ name: 'Tickets', primaryColor: 'blue', logoUrl: null });
  }

  function setupNoExternal(): void {
    queryParamMap = {};
    fixture.detectChanges();
    flushBranding();
  }

  function setupExternal(): void {
    queryParamMap = { t: 'external-token' };
    fixture.detectChanges();
    flushBranding();
  }

  describe('basic login', () => {
    it('logs in successfully and navigates to home', () => {
      const navigateSpy = jest.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
      setupNoExternal();

      component.username = ' mario ';
      component.password = 'secret';
      component.login();

      expect(auth.login).toHaveBeenCalledWith(' mario ', 'secret');
      auth.login$.next(user);
      expect(navigateSpy).toHaveBeenCalledWith('/');
      expect(component.loading).toBe(true);
    });

    it('sets error on login 401', () => {
      setupNoExternal();

      component.username = 'mario';
      component.password = 'bad';
      component.login();

      auth.login$.error(new HttpErrorResponse({ status: 401, statusText: 'Unauthorized' }));
      expect(component.error).toBe('Username o password non validi.');
      expect(component.loading).toBe(false);
    });

    it('sets generic error on 500', () => {
      setupNoExternal();

      component.username = 'mario';
      component.password = 'bad';
      component.login();

      auth.login$.error(new HttpErrorResponse({ status: 500, statusText: 'Server Error' }));
      expect(component.error).toBe('Accesso non disponibile. Verifica che il backend sia avviato e riprova.');
    });

    it('ignores login when inputs are blank', () => {
      setupNoExternal();
      auth.login.mockClear();

      component.username = '  ';
      component.password = '';
      component.login();

      expect(auth.login).not.toHaveBeenCalled();
    });
  });

  describe('external token flow', () => {
    it('external token in URL replaces state and calls loginExternal', () => {
      setupExternal();

      expect(auth.loginExternal).toHaveBeenCalledWith('external-token');
      expect(locationReplaceState).toHaveBeenCalledWith('/login');
    });

    it('external login success routes to / and remembers project', () => {
      const navigateSpy = jest.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
      setupExternal();

      auth.external$.next(7);

      expect(projectContext.rememberExternalProject).toHaveBeenCalledWith(7);
      expect(navigateSpy).toHaveBeenCalledWith('/');
    });

    it('external 401 shows token error', () => {
      setupExternal();

      auth.external$.error(new HttpErrorResponse({ status: 401, statusText: 'Unauthorized' }));
      expect(component.error).toBe('Token di accesso esterno non valido o scaduto.');
    });

    it('external non-401 error shows generic message', () => {
      setupExternal();

      auth.external$.error(new HttpErrorResponse({ status: 500, statusText: 'Server Error' }));
      expect(component.error).toBe('Accesso con token non disponibile. Verifica che il backend sia aggiornato e raggiungibile.');
    });
  });

  it('redirects to /setup when setup is required', () => {
    const navigateSpy = jest.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    setupNoExternal();

    setup.status$.next({ required: true });

    expect(navigateSpy).toHaveBeenCalledWith('/setup');
  });
});