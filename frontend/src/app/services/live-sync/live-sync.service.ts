import { HttpClient } from '@angular/common/http';
import { Injectable, NgZone, inject, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import type { LiveMessage } from '../../shared/models/live-sync.types';

@Injectable({ providedIn: 'root' })
export class LiveSyncService {
  private static readonly MIN_SESSION_SECONDS = 35;
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly zone = inject(NgZone);
  readonly revision = signal(0);
  readonly connected = signal(false);

  watch(projectId: number): Subscription {
    let stopped = false;
    let socket: WebSocket | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let ticketRequest: Subscription | null = null;
    let retryDelay = 1000;

    const reconnect = () => {
      if (stopped || !this.auth.user() || retryTimer !== null) return;
      retryTimer = setTimeout(() => {
        retryTimer = null;
        connect();
      }, retryDelay);
      retryDelay = Math.min(retryDelay * 2, 30_000);
    };

    const connect = () => {
      if (stopped || !this.auth.user()) return;
      if (!this.auth.hasUsableSession(LiveSyncService.MIN_SESSION_SECONDS)) {
        this.zone.run(() => this.connected.set(false));
        return;
      }
      this.zone.run(() => this.connected.set(false));
      ticketRequest = this.http.post<{ value: string }>('/api/work/live/tickets', { projectId }, {
        headers: this.auth.authHeaders()
      }).subscribe({
        next: ticket => {
          if (stopped) return;
          const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
          const activeSocket = new WebSocket(`${protocol}//${location.host}/api/work/live?ticket=${encodeURIComponent(ticket.value)}`);
          socket = activeSocket;
          activeSocket.onopen = () => {
            if (stopped) { activeSocket.close(); return; }
            retryDelay = 1000;
            this.zone.run(() => this.connected.set(true));
          };
          activeSocket.onmessage = event => {
            if (stopped) return;
            let message: LiveMessage;
            try { message = JSON.parse(event.data) as LiveMessage; } catch { return; }
            if (message.kind === 'ready' || message.kind === 'changed') {
              // A ready message also refreshes changes made while the socket was disconnected.
              this.zone.run(() => this.revision.update(value => value + 1));
            }
          };
          activeSocket.onerror = () => activeSocket.close();
          activeSocket.onclose = () => {
            if (stopped) return;
            if (socket === activeSocket) socket = null;
            this.zone.run(() => this.connected.set(false));
            reconnect();
          };
        },
        error: () => reconnect()
      });
    };

    connect();
    return new Subscription(() => {
      stopped = true;
      ticketRequest?.unsubscribe();
      if (retryTimer !== null) clearTimeout(retryTimer);
      socket?.close();
      socket = null;
      this.zone.run(() => this.connected.set(false));
    });
  }
}
