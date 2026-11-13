import { IncomingMessage, Server } from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import { eventBus } from '@athena/core';
import { logger } from '@athena/shared';
import { config } from '../config';
import { verifyToken } from '../middleware/auth';

interface ClientSocket extends WebSocket {
  userId: string;
  isAlive: boolean;
}

const HEARTBEAT_MS = 30000;

/**
 * Real-time channel. Clients connect to /ws?token=<short-lived ws token> and
 * receive only events for their own executions and approvals.
 */
export function attachWebSocketServer(server: Server): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });
  const clients = new Map<string, Set<ClientSocket>>();

  server.on('upgrade', (req: IncomingMessage, socket, head) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname !== '/ws') {
      socket.destroy();
      return;
    }
    const origin = req.headers.origin;
    if (origin && !config.corsOrigins.includes(origin)) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }
    let userId: string;
    try {
      userId = verifyToken(url.searchParams.get('token') ?? '', 'ws').id;
    } catch {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      const client = ws as ClientSocket;
      client.userId = userId;
      client.isAlive = true;
      wss.emit('connection', client, req);
    });
  });

  wss.on('connection', (ws: ClientSocket) => {
    const set = clients.get(ws.userId) ?? new Set<ClientSocket>();
    set.add(ws);
    clients.set(ws.userId, set);

    ws.on('pong', () => {
      ws.isAlive = true;
    });
    ws.on('message', () => {
      // Clients do not send commands; ignore input
    });
    ws.on('close', () => {
      set.delete(ws);
      if (set.size === 0) clients.delete(ws.userId);
    });
    ws.send(JSON.stringify({ type: 'connected', timestamp: new Date().toISOString() }));
  });

  const send = (userId: string, type: string, data: unknown): void => {
    const set = clients.get(userId);
    if (!set) return;
    const message = JSON.stringify({ type, data, timestamp: new Date().toISOString() });
    for (const ws of set) {
      if (ws.readyState === WebSocket.OPEN) ws.send(message);
    }
  };

  const unsubscribers = [
    eventBus.on('execution.event', ({ userId, event }) => send(userId, 'execution.event', event)),
    eventBus.on('execution.status', ({ userId, ...data }) => send(userId, 'execution.status', data)),
    eventBus.on('approval.requested', ({ userId, ...data }) => send(userId, 'approval.requested', data)),
    eventBus.on('approval.decided', ({ userId, ...data }) => send(userId, 'approval.decided', data)),
  ];

  const heartbeat = setInterval(() => {
    for (const set of clients.values()) {
      for (const ws of set) {
        if (!ws.isAlive) {
          ws.terminate();
          continue;
        }
        ws.isAlive = false;
        ws.ping();
      }
    }
  }, HEARTBEAT_MS);

  wss.on('close', () => {
    clearInterval(heartbeat);
    unsubscribers.forEach((u) => u());
  });

  logger.info('WebSocket server attached at /ws');
  return wss;
}
