import { HttpHeaders, HttpParams } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { EventsService } from './events.service';
import { AuthService } from '../auth/auth.service';
import type { EventActor, EventFilters, EventPage } from '../../shared/models/event.types';

describe('EventsService', () => {
  let service: EventsService;
  let http: HttpTestingController;
  let auth: { authHeaders: jest.Mock };

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
    service = TestBed.inject(EventsService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    sessionStorage.clear();
  });

  it('list() sends page and size only when no filters are provided', () => {
    const filters: EventFilters = { page: 0, size: 25 };
    const page: EventPage = { items: [], total: 0 };
    let resolved: EventPage | undefined;
    service.list(1, filters).subscribe(value => { resolved = value; });
    const req = http.expectOne(r => r.url === '/api/work/projects/1/events');
    expect(req.request.method).toBe('GET');
    expect(req.request.headers.get('Authorization')).toBe('Bearer test');
    expect(req.request.params.get('page')).toBe('0');
    expect(req.request.params.get('size')).toBe('25');
    expect(req.request.params.has('type')).toBe(false);
    expect(req.request.params.has('actorId')).toBe(false);
    expect(req.request.params.has('from')).toBe(false);
    expect(req.request.params.has('to')).toBe(false);
    req.flush(page);
    expect(resolved).toEqual(page);
  });

  it('list() forwards every defined filter as HttpParams', () => {
    const filters: EventFilters = {
      page: 2,
      size: 10,
      type: 'ISSUE_CREATED',
      actorId: 7,
      from: '2026-09-01',
      to: '2026-09-30'
    };
    const page: EventPage = { items: [], total: 0 };
    let resolved: EventPage | undefined;
    service.list(1, filters).subscribe(value => { resolved = value; });
    const req = http.expectOne(r => r.url === '/api/work/projects/1/events');
    expect(req.request.method).toBe('GET');
    expect(req.request.headers.get('Authorization')).toBe('Bearer test');
    expect(req.request.params.get('page')).toBe('2');
    expect(req.request.params.get('size')).toBe('10');
    expect(req.request.params.get('type')).toBe('ISSUE_CREATED');
    expect(req.request.params.get('actorId')).toBe('7');
    expect(req.request.params.get('from')).toBe('2026-09-01');
    expect(req.request.params.get('to')).toBe('2026-09-30');
    req.flush(page);
    expect(resolved).toEqual(page);
  });

  it('actors() GETs the event actors for the project', () => {
    const actors: EventActor[] = [{ id: 1, username: 'mario' }];
    let resolved: EventActor[] | undefined;
    service.actors(1).subscribe(value => { resolved = value; });
    const req = http.expectOne('/api/work/projects/1/events/actors');
    expect(req.request.method).toBe('GET');
    expect(req.request.headers.get('Authorization')).toBe('Bearer test');
    req.flush(actors);
    expect(resolved).toEqual(actors);
  });
});
