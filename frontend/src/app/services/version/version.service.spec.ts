import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { VersionService } from './version.service';

describe('VersionService', () => {
  let service: VersionService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });
    service = TestBed.inject(VersionService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('load() fetches /api/version once and stores it', () => {
    service.load();
    expect(service.info()).toBeNull();

    const req = http.expectOne('/api/version');
    expect(req.request.method).toBe('GET');
    req.flush({
      version: '1.2.3', commit: 'abc1234567890',
      buildTime: '2026-09-22T14:30:15Z',
      environment: 'production', api: 'v1'
    });

    expect(service.info()).toEqual({
      version: '1.2.3', commit: 'abc1234567890',
      buildTime: '2026-09-22T14:30:15Z',
      environment: 'production', api: 'v1'
    });
  });

  it('load() does not fetch twice', () => {
    service.load();
    http.expectOne('/api/version').flush({ version: 'a', commit: 'b', buildTime: 'c', environment: 'd', api: 'e' });

    service.load();
    http.expectNone('/api/version');
  });

  it('load() swallows network errors and leaves info null', () => {
    service.load();
    http.expectOne('/api/version').flush('boom', { status: 500, statusText: 'Server Error' });
    expect(service.info()).toBeNull();
  });
});
