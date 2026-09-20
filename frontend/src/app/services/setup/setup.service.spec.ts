import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { SetupService } from './setup.service';
import type { SetupInput, SetupStatus } from '../../shared/models/setup.types';

describe('SetupService', () => {
  let service: SetupService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });
    service = TestBed.inject(SetupService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  it('status() GETs /api/setup/status', () => {
    const payload: SetupStatus = { required: true };
    let resolved: SetupStatus | undefined;
    service.status().subscribe(value => { resolved = value; });
    const req = http.expectOne('/api/setup/status');
    expect(req.request.method).toBe('GET');
    req.flush(payload);
    expect(resolved).toEqual(payload);
  });

  it('setup() POSTs a multipart FormData when a logo is provided', () => {
    const input: SetupInput = {
      teamCompanyName: 'ACME',
      primaryColor: 'red',
      username: 'admin',
      email: 'admin@acme.test',
      password: 'secret',
      firstName: 'Admin',
      lastName: 'User'
    };
    const logo = new File(['logo-bytes'], 'logo.png', { type: 'image/png' });
    let resolved: void | undefined;
    service.setup(input, logo).subscribe(value => { resolved = value; });
    const req = http.expectOne('/api/setup');
    expect(req.request.method).toBe('POST');
    expect(req.request.body instanceof FormData).toBe(true);
    const form = req.request.body as FormData;
    const inputBlob = form.get('input') as Blob;
    expect(inputBlob).toBeTruthy();
    expect(inputBlob.type).toBe('application/json');
    expect((form.get('logo') as File).name).toBe('logo.png');
    req.flush(null);
    expect(resolved).toBeNull();
  });

  it('setup() POSTs FormData without a logo entry when no logo is provided', () => {
    const input: SetupInput = {
      teamCompanyName: 'ACME',
      primaryColor: 'blue',
      username: 'admin',
      email: 'admin@acme.test',
      password: 'secret',
      firstName: null,
      lastName: null
    };
    let resolved: void | undefined;
    service.setup(input, null).subscribe(value => { resolved = value; });
    const req = http.expectOne('/api/setup');
    expect(req.request.method).toBe('POST');
    const form = req.request.body as FormData;
    expect(form.has('logo')).toBe(false);
    const inputBlob = form.get('input') as Blob;
    expect(inputBlob.type).toBe('application/json');
    req.flush(null);
    expect(resolved).toBeNull();
  });
});
