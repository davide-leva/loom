import { HttpHeaders } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { ExternalAuthConfigService } from './external-auth.service';
import { AuthService } from '../../auth/auth.service';
import type {
  ExternalApplicationInput,
  ExternalAuthConfig,
  ExternalJwtSecret,
  ExternalSubjectMapping
} from '../../../shared/models/external-auth.types';

describe('ExternalAuthConfigService', () => {
  let service: ExternalAuthConfigService;
  let http: HttpTestingController;
  let auth: { authHeaders: jest.Mock };

  const config: ExternalAuthConfig = {
    projectId: 1,
    enabled: false,
    secrets: []
  };

  const mapping: ExternalSubjectMapping = {
    id: 5,
    subject: 'alice',
    userId: 100,
    username: 'alice'
  };

  const secret: ExternalJwtSecret = {
    id: 7,
    name: 'Portal',
    algorithm: 'HS256',
    secretBase64: false,
    userCount: 1,
    mappings: [mapping]
  };

  beforeEach(() => {
    sessionStorage.clear();
    auth = { authHeaders: jest.fn(() => new HttpHeaders({ Authorization: 'Bearer test' })) };
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: auth }
      ]
    });
    service = TestBed.inject(ExternalAuthConfigService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    sessionStorage.clear();
  });

  it('get() GETs the project config', () => {
    let resolved: ExternalAuthConfig | undefined;
    service.get(1).subscribe(value => { resolved = value; });
    const req = http.expectOne('/api/external-auth/projects/1');
    expect(req.request.method).toBe('GET');
    expect(req.request.headers.get('Authorization')).toBe('Bearer test');
    req.flush(config);
    expect(resolved).toEqual(config);
  });

  it('setEnabled() PUTs the enabled flag', () => {
    let resolved: ExternalAuthConfig | undefined;
    service.setEnabled(1, true).subscribe(value => { resolved = value; });
    const req = http.expectOne('/api/external-auth/projects/1');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ enabled: true });
    expect(req.request.headers.get('Authorization')).toBe('Bearer test');
    req.flush({ ...config, enabled: true });
    expect(resolved).toEqual({ ...config, enabled: true });
  });

  it('addSecret() POSTs the application input', () => {
    const input: ExternalApplicationInput = {
      name: 'Portal',
      secret: 's3cret',
      algorithm: 'HS256',
      secretBase64: false
    };
    let resolved: ExternalAuthConfig | undefined;
    service.addSecret(1, input).subscribe(value => { resolved = value; });
    const req = http.expectOne('/api/external-auth/projects/1/secrets');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(input);
    expect(req.request.headers.get('Authorization')).toBe('Bearer test');
    req.flush({ ...config, secrets: [secret] });
    expect(resolved).toEqual({ ...config, secrets: [secret] });
  });

  it('updateSecret() PUTs the application input for a given secret', () => {
    const input: ExternalApplicationInput = {
      name: 'Portal',
      secret: 'rotated',
      algorithm: 'HS384',
      secretBase64: true
    };
    let resolved: ExternalAuthConfig | undefined;
    service.updateSecret(1, 7, input).subscribe(value => { resolved = value; });
    const req = http.expectOne('/api/external-auth/projects/1/secrets/7');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual(input);
    expect(req.request.headers.get('Authorization')).toBe('Bearer test');
    req.flush({ ...config, secrets: [secret] });
    expect(resolved).toEqual({ ...config, secrets: [secret] });
  });

  it('deleteSecret() DELETEs the secret', () => {
    let resolved: void | undefined;
    service.deleteSecret(1, 7).subscribe(value => { resolved = value; });
    const req = http.expectOne('/api/external-auth/projects/1/secrets/7');
    expect(req.request.method).toBe('DELETE');
    expect(req.request.headers.get('Authorization')).toBe('Bearer test');
    req.flush(null);
    expect(resolved).toBeNull();
  });

  it('addMapping() POSTs subject and userId', () => {
    let resolved: ExternalAuthConfig | undefined;
    service.addMapping(1, 7, 'alice', 100).subscribe(value => { resolved = value; });
    const req = http.expectOne('/api/external-auth/projects/1/secrets/7/mappings');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ subject: 'alice', userId: 100 });
    expect(req.request.headers.get('Authorization')).toBe('Bearer test');
    req.flush({ ...config, secrets: [secret] });
    expect(resolved).toEqual({ ...config, secrets: [secret] });
  });

  it('deleteMapping() DELETEs the mapping', () => {
    let resolved: void | undefined;
    service.deleteMapping(1, 7, 5).subscribe(value => { resolved = value; });
    const req = http.expectOne('/api/external-auth/projects/1/secrets/7/mappings/5');
    expect(req.request.method).toBe('DELETE');
    expect(req.request.headers.get('Authorization')).toBe('Bearer test');
    req.flush(null);
    expect(resolved).toBeNull();
  });
});
