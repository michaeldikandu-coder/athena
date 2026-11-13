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

function wsBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_WS_URL) return process.env.NEXT_PUBLIC_WS_URL;
  const { protocol, hostname } = window.location;
  const scheme = protocol === 'https:' ? 'wss' : 'ws';
  return `${scheme}://${hostname}:3001/ws`;
}

/**
 * One shared WebSocket per tab, with reconnect and fresh short-lived tokens
 */
class RealtimeClient {
  private socket: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private statusListeners = new Set<(connected: boolean) => void>();
  private retry = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = true;
  connected = false;

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    this.ensureStarted();
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0 && this.statusListeners.size === 0) this.stop();
    };
  }

  onStatus(listener: (connected: boolean) => void): () => void {
    this.statusListeners.add(listener);
    listener(this.connected);
    this.ensureStarted();
    return () => {
      this.statusListeners.delete(listener);
      if (this.listeners.size === 0 && this.statusListeners.size === 0) this.stop();
    };
  }

  private setConnected(value: boolean): void {
    this.connected = value;
    this.statusListeners.forEach((l) => l(value));
  }

  private ensureStarted(): void {
    if (!this.stopped) return;
    this.stopped = false;
    void this.connect();
  }

  private stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.socket?.close();
    this.socket = null;
  }

  private async connect(): Promise<void> {
    if (this.stopped) return;
    try {
      const { data } = await api<{ token: string }>('/auth/ws-token');
      const socket = new WebSocket(`${wsBaseUrl()}?token=${encodeURIComponent(data.token)}`);
      this.socket = socket;
      socket.onopen = () => {
        this.retry = 0;
        this.setConnected(true);
      };
      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as RealtimeMessage;
          this.listeners.forEach((l) => l(message));
        } catch {
          // ignore malformed frames
        }
      };
      socket.onclose = () => {
        this.setConnected(false);
        this.scheduleReconnect();
      };
      socket.onerror = () => socket.close();
    } catch {
      this.setConnected(false);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.stopped) return;
    const delay = Math.min(1000 * 2 ** this.retry, 15000);
    this.retry += 1;
    this.timer = setTimeout(() => void this.connect(), delay);
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
