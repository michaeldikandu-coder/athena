'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from './api';

export type RealtimeMessage =
  | { type: 'connected'; timestamp: string }
  | { type: 'execution.event'; data: any; timestamp: string }
  | { type: 'execution.status'; data: { executionId: string; agentId: string; status: string; error?: string }; timestamp: string }
  | { type: 'approval.requested'; data: { approvalId: string; executionId: string; tool: string }; timestamp: string }
  | { type: 'approval.decided'; data: { approvalId: string; executionId: string; status: string }; timestamp: string };

type Listener = (message: RealtimeMessage) => void;

const VISIBLE_MS = 2500;
const HIDDEN_MS = 15000;
const MAX_BACKOFF_MS = 30000;

/**
 * One shared poller per tab. GET /api/realtime returns what changed since the
 * last cursor; this works on serverless hosts where WebSockets are not
 * available. Messages seen in the overlap between polls are dropped.
 */
class RealtimeClient {
  private listeners = new Set<Listener>();
  private statusListeners = new Set<(connected: boolean) => void>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private cursor: string | null = null;
  private seen = new Map<string, number>();
  private failures = 0;
  private running = false;
  private inFlight = false;
  connected = false;

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    this.ensureStarted();
    return () => {
      this.listeners.delete(listener);
      this.maybeStop();
    };
  }

  onStatus(listener: (connected: boolean) => void): () => void {
    this.statusListeners.add(listener);
    listener(this.connected);
    this.ensureStarted();
    return () => {
      this.statusListeners.delete(listener);
      this.maybeStop();
    };
  }

  private setConnected(value: boolean): void {
    if (this.connected === value) return;
    this.connected = value;
    this.statusListeners.forEach((l) => l(value));
  }

  private ensureStarted(): void {
    if (this.running) return;
    this.running = true;
    document.addEventListener('visibilitychange', this.onVisibility);
    void this.poll();
  }

  private maybeStop(): void {
    if (this.listeners.size > 0 || this.statusListeners.size > 0) return;
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    document.removeEventListener('visibilitychange', this.onVisibility);
  }

  private onVisibility = (): void => {
    // Catch up straight away when the tab comes back
    if (document.visibilityState === 'visible' && this.running && !this.inFlight) {
      if (this.timer) clearTimeout(this.timer);
      void this.poll();
    }
  };

  /** Same message twice (poll overlap) is delivered once */
  private key(m: RealtimeMessage): string {
    if (m.type === 'execution.event') return `e:${m.data.id}`;
    if (m.type === 'execution.status') return `s:${m.data.executionId}:${m.data.status}:${(m.data as { updatedAt?: string }).updatedAt}`;
    if (m.type === 'approval.requested' || m.type === 'approval.decided') return `a:${m.data.approvalId}:${m.type}`;
    return m.type;
  }

  private async poll(): Promise<void> {
    if (!this.running) return;
    this.inFlight = true;
    try {
      const query = this.cursor ? `?since=${encodeURIComponent(this.cursor)}` : '';
      const { data } = await api<{ cursor: string; messages: RealtimeMessage[] }>(`/realtime${query}`);
      const first = this.cursor === null;
      this.cursor = data.cursor;
      this.failures = 0;
      this.setConnected(true);
      const now = Date.now();
      for (const message of data.messages) {
        const key = this.key(message);
        if (this.seen.has(key)) continue;
        this.seen.set(key, now);
        if (!first) this.listeners.forEach((l) => l(message));
      }
      for (const [key, at] of this.seen) if (now - at > 60_000) this.seen.delete(key);
    } catch {
      this.failures += 1;
      this.setConnected(false);
    } finally {
      this.inFlight = false;
    }
    if (!this.running) return;
    const base = document.visibilityState === 'visible' ? VISIBLE_MS : HIDDEN_MS;
    const delay = this.failures ? Math.min(base * 2 ** this.failures, MAX_BACKOFF_MS) : base;
    this.timer = setTimeout(() => void this.poll(), delay);
  }
}

let client: RealtimeClient | null = null;
function getClient(): RealtimeClient {
  if (!client) client = new RealtimeClient();
  return client;
}

/**
 * Subscribe to realtime messages. The handler can change between renders.
 */
export function useRealtime(handler: Listener): void {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => getClient().subscribe((m) => ref.current(m)), []);
}

export function useRealtimeStatus(): boolean {
  const [connected, setConnected] = useState(false);
  useEffect(() => getClient().onStatus(setConnected), []);
  return connected;
}
