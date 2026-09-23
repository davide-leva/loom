import { HttpHeaders } from '@angular/common/http';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { NotificheSegnalazioniService } from './notifiche-segnalazioni.service';
import { AuthService } from '../auth/auth.service';
import type { RiepilogoNotificheSegnalazioni } from '../../shared/models/notification.types';

describe('NotificheSegnalazioniService', () => {
  let service: NotificheSegnalazioniService;
  let http: HttpTestingController;
  let auth: { authHeaders: jest.Mock };

  const summary: RiepilogoNotificheSegnalazioni = {
    projectId: 1,
    total: 3,
    planning: 1,
    anomalies: 1,
    improvements: 1,
    implementations: 0,
    issues: [
      { issueId: 10, issueType: null },
      { issueId: 11, issueType: 'ANOMALY' },
      { issueId: 12, issueType: 'IMPROVEMENT' }
    ]
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
    service = TestBed.inject(NotificheSegnalazioniService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    sessionStorage.clear();
  });

  it('refresh() fetches the project notifications with auth headers', () => {
    service.refresh(1);
    const req = http.expectOne('/api/work/projects/1/notifications');
    expect(req.request.method).toBe('GET');
    expect(req.request.headers.get('Authorization')).toBe('Bearer test');
    req.flush(summary);
  });

  it('count() reports 0 before any summary is loaded', () => {
    expect(service.count('PLANNING')).toBe(0);
    expect(service.count('ANOMALY')).toBe(0);
    expect(service.count('IMPROVEMENT')).toBe(0);
    expect(service.count('IMPLEMENTATION')).toBe(0);
  });

  it('count() returns the section counts after a summary is loaded', fakeAsync(() => {
    service.refresh(1);
    http.expectOne('/api/work/projects/1/notifications').flush(summary);
    tick();
    expect(service.count('PLANNING')).toBe(1);
    expect(service.count('ANOMALY')).toBe(1);
    expect(service.count('IMPROVEMENT')).toBe(1);
    expect(service.count('IMPLEMENTATION')).toBe(0);
  }));

  it('isUnread() returns false before any summary is loaded', () => {
    expect(service.isUnread(10)).toBe(false);
  });

  it('isUnread() returns true for issues in the current summary', fakeAsync(() => {
    service.refresh(1);
    http.expectOne('/api/work/projects/1/notifications').flush(summary);
    tick();
    expect(service.isUnread(10)).toBe(true);
    expect(service.isUnread(99)).toBe(false);
  }));

  it('markSeen() drops the matching issue and reloads the summary', fakeAsync(() => {
    service.refresh(1);
    http.expectOne('/api/work/projects/1/notifications').flush(summary);
    tick();

    service.markSeen(11);
    expect(service.isUnread(11)).toBe(false);

    const reload = http.expectOne('/api/work/projects/1/notifications');
    reload.flush(summary);
    tick();
    expect(reload.request.headers.get('Authorization')).toBe('Bearer test');
  }));

  it('markSeen() still triggers a refresh even when the issue is not in the summary', fakeAsync(() => {
    service.refresh(1);
    http.expectOne('/api/work/projects/1/notifications').flush(summary);
    tick();

    service.markSeen(99);
    const reload = http.expectOne('/api/work/projects/1/notifications');
    reload.flush(summary);
    tick();
  }));

  it('markSeen() before any summary is loaded does not trigger a refresh', () => {
    service.markSeen(10);
    http.expectNone('/api/work/projects/1/notifications');
  });

  it('clear() drops the current summary and cancels pending refreshes', fakeAsync(() => {
    service.refresh(1);
    service.clear();
    const req = http.expectOne('/api/work/projects/1/notifications');
    req.flush(summary);
    tick();
    // The late response from the cancelled sequence must not update the count.
    expect(service.count('ANOMALY')).toBe(0);
    expect(service.isUnread(10)).toBe(false);
  }));

  it('refresh() ignores stale responses when superseded by a newer call', fakeAsync(() => {
    service.refresh(1);
    service.refresh(1);
    const [stale, fresh] = http.match('/api/work/projects/1/notifications');
    fresh.flush(summary);
    stale.flush({
      projectId: 1,
      total: 0,
      planning: 0,
      anomalies: 0,
      improvements: 0,
      implementations: 0,
      issues: []
    });
    tick();
    expect(service.count('ANOMALY')).toBe(1);
  }));
});
