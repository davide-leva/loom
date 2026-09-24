import { HttpHeaders } from '@angular/common/http';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { LiveSyncService } from './live-sync.service';
import { AuthService } from '../auth/auth.service';
import type { CurrentUser } from '../../shared/models/auth.types';

type WsCallbacks = {
  onopen: (() => void) | null;
  onclose: (() => void) | null;
  onmessage: ((event: { data: string }) => void) | null;
  onerror: (() => void) | null;
};

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  url: string;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  close(): void {
    this.closed = true;
    if (this.onclose) this.onclose();
  }

  emitOpen(): void {
    if (this.onopen) this.onopen();
  }

  emitMessage(data: string): void {
    if (this.onmessage) this.onmessage({ data });
  }

  emitErrorAndClose(): void {
    if (this.onerror) this.onerror();
    this.close();
  }
}

describe('LiveSyncService', () => {
  let service: LiveSyncService;
  let http: HttpTestingController;
  let auth: { authHeaders: jest.Mock; hasUsableSession: jest.Mock; user: { (): CurrentUser | null } };
  let originalWebSocket: typeof WebSocket | undefined;

  const user: CurrentUser = {
    id: 1,
    username: 'mario',
    displayName: 'Mario',
    email: 'mario@test',
    role: 'TEAM',
    companyName: null,
    companyId: null,
    primaryColor: 'blue',
    companyLogoUrl: null,
    internalCompanyName: null,
    internalLogoUrl: null
  };

  beforeEach(() => {
    sessionStorage.clear();
    originalWebSocket = globalThis.WebSocket;
    FakeWebSocket.instances = [];
    // The service reaches for the global WebSocket constructor.
    (globalThis as unknown as { WebSocket: typeof FakeWebSocket }).WebSocket = FakeWebSocket as unknown as typeof WebSocket;

    auth = {
      authHeaders: jest.fn(() => new HttpHeaders({ Authorization: 'Bearer test' })),
      hasUsableSession: jest.fn(() => true),
      user: jest.fn(() => user)
    };

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: auth }
      ]
    });
    service = TestBed.inject(LiveSyncService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    sessionStorage.clear();
    if (originalWebSocket) {
      globalThis.WebSocket = originalWebSocket;
    } else {
      delete (globalThis as unknown as { WebSocket?: typeof WebSocket }).WebSocket;
    }
  });

  it('starts disconnected before any socket is opened', () => {
    expect(service.connected()).toBe(false);
    expect(service.revision()).toBe(0);
  });

  it('watch() opens a WebSocket after fetching a ticket', fakeAsync(() => {
    const sub = service.watch(42);
    const ticketReq = http.expectOne('/api/work/live/tickets');
    expect(ticketReq.request.method).toBe('POST');
    expect(ticketReq.request.body).toEqual({ projectId: 42 });
    expect(ticketReq.request.headers.get('Authorization')).toBe('Bearer test');
    ticketReq.flush({ value: 'ticket-abc' });
    tick();

    expect(FakeWebSocket.instances.length).toBe(1);
    expect(FakeWebSocket.instances[0].url).toContain('/api/work/live?ticket=ticket-abc');

    sub.unsubscribe();
  }));

  it('marks the service as connected when the socket opens', fakeAsync(() => {
    const sub = service.watch(42);
    http.expectOne('/api/work/live/tickets').flush({ value: 'ticket-abc' });
    tick();

    expect(service.connected()).toBe(false);
    FakeWebSocket.instances[0].emitOpen();
    expect(service.connected()).toBe(true);

    sub.unsubscribe();
  }));

  it('marks the service as disconnected when the socket closes', fakeAsync(() => {
    const sub = service.watch(42);
    http.expectOne('/api/work/live/tickets').flush({ value: 'ticket-abc' });
    tick();

    FakeWebSocket.instances[0].emitOpen();
    FakeWebSocket.instances[0].close();
    expect(service.connected()).toBe(false);

    sub.unsubscribe();
  }));

  it('bumps the revision when a "changed" message is received', fakeAsync(() => {
    const sub = service.watch(42);
    http.expectOne('/api/work/live/tickets').flush({ value: 'ticket-abc' });
    tick();
    FakeWebSocket.instances[0].emitOpen();

    expect(service.revision()).toBe(0);
    FakeWebSocket.instances[0].emitMessage(JSON.stringify({ kind: 'changed', issueId: 9 }));
    expect(service.revision()).toBe(1);

    FakeWebSocket.instances[0].emitMessage(JSON.stringify({ kind: 'changed', issueId: 11 }));
    expect(service.revision()).toBe(2);

    sub.unsubscribe();
  }));

  it('bumps the revision when a "ready" message is received', fakeAsync(() => {
    const sub = service.watch(42);
    http.expectOne('/api/work/live/tickets').flush({ value: 'ticket-abc' });
    tick();
    FakeWebSocket.instances[0].emitOpen();

    FakeWebSocket.instances[0].emitMessage(JSON.stringify({ kind: 'ready' }));
    expect(service.revision()).toBe(1);

    sub.unsubscribe();
  }));

  it('does not bump the revision for heartbeat or unparsable messages', fakeAsync(() => {
    const sub = service.watch(42);
    http.expectOne('/api/work/live/tickets').flush({ value: 'ticket-abc' });
    tick();
    FakeWebSocket.instances[0].emitOpen();

    FakeWebSocket.instances[0].emitMessage(JSON.stringify({ kind: 'heartbeat' }));
    FakeWebSocket.instances[0].emitMessage('not-json');

    expect(service.revision()).toBe(0);
    sub.unsubscribe();
  }));

  it('closes the socket and stops reconnecting when the subscription is unsubscribed', fakeAsync(() => {
    const sub = service.watch(42);
    http.expectOne('/api/work/live/tickets').flush({ value: 'ticket-abc' });
    tick();
    FakeWebSocket.instances[0].emitOpen();
    expect(service.connected()).toBe(true);

    sub.unsubscribe();
    expect(FakeWebSocket.instances[0].closed).toBe(true);
    expect(service.connected()).toBe(false);
  }));

  it('does not request a ticket when the session is near expiration', fakeAsync(() => {
    auth.hasUsableSession.mockReturnValue(false);
    const sub = service.watch(42);
    tick();

    http.expectNone('/api/work/live/tickets');
    expect(FakeWebSocket.instances.length).toBe(0);

    sub.unsubscribe();
  }));
});
