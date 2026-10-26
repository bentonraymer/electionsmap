import cookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import websocket from '@fastify/websocket';
import Fastify, { type FastifyRequest } from 'fastify';
import { timingSafeEqual } from 'node:crypto';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { WebSocket } from 'ws';
import type { Action } from '../shared/types.js';
import { search } from './civic.js';
import { config } from './config.js';
import { startPoller } from './poller.js';
import { simBase, startSim } from './sim.js';
import { store } from './store.js';

const app = Fastify({ logger: { level: 'warn' }, trustProxy: true });
await app.register(cookie, { secret: config.cookieSecret });
await app.register(websocket, { options: { perMessageDeflate: true } });

const AUTH_COOKIE = 'em_auth';

function authed(req: FastifyRequest) {
  const raw = req.cookies[AUTH_COOKIE];
  if (!raw) return false;
  const v = req.unsignCookie(raw);
  return v.valid && v.value === 'control';
}

function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

// ---- auth -------------------------------------------------------------------

app.post<{ Body: { password?: string } }>('/api/login', async (req, reply) => {
  if (!safeEqual(String(req.body?.password ?? ''), config.controlPassword)) {
    return reply.code(401).send({ error: 'Wrong password' });
  }
  reply.setCookie(AUTH_COOKIE, 'control', {
    signed: true, httpOnly: true, sameSite: 'lax', path: '/', secure: 'auto', maxAge: 60 * 60 * 24 * 14,
  });
  return { ok: true };
});

app.post('/api/logout', async (_req, reply) => {
  reply.clearCookie(AUTH_COOKIE, { path: '/' });
  return { ok: true };
});

app.get('/api/me', async (req) => ({ authed: authed(req) }));

// ---- control API --------------------------------------------------------------

app.post<{ Body: Action }>('/api/action', async (req, reply) => {
  if (!authed(req)) return reply.code(401).send({ error: 'Not logged in' });
  try {
    store.apply(req.body);
    return { ok: true };
  } catch (e) {
    return reply.code(400).send({ error: (e as Error).message });
  }
});

app.get<{ Querystring: { q?: string } }>('/api/search', async (req, reply) => {
  if (!authed(req)) return reply.code(401).send({ error: 'Not logged in' });
  const q = (req.query.q ?? '').trim();
  if (q.length < 2) return [];
  try {
    return await search(q);
  } catch (e) {
    return reply.code(502).send({ error: (e as Error).message });
  }
});

app.get('/healthz', async () => ({ ok: true, health: store.health }));

// ---- websocket: every client gets the full snapshot on connect and on every change -------

const clients = new Set<WebSocket>();
let pending: NodeJS.Timeout | undefined;

store.onChange(() => {
  if (pending) return;
  pending = setTimeout(() => {
    pending = undefined;
    const msg = JSON.stringify({ type: 'snapshot', data: store.snapshot() });
    for (const ws of clients) if (ws.readyState === 1) ws.send(msg);
  }, 100);
});

app.get<{ Querystring: { token?: string } }>('/ws', { websocket: true }, (socket, req) => {
  if (config.displayToken && req.query.token !== config.displayToken && !authed(req)) {
    socket.close(4401, 'bad token');
    return;
  }
  clients.add(socket);
  socket.send(JSON.stringify({ type: 'snapshot', data: store.snapshot() }));
  socket.on('message', (m: Buffer) => { if (m.toString() === 'ping') socket.send('{"type":"pong"}'); });
  socket.on('close', () => clients.delete(socket));
});

// ---- static web app ------------------------------------------------------------

// Only the built app (dist/web) is served; in dev, Vite serves the front end and proxies /api + /ws.
const webRoot = fileURLToPath(new URL('../web/', import.meta.url));
if (import.meta.url.includes('/dist/server/') && existsSync(webRoot)) {
  await app.register(fastifyStatic, { root: webRoot, wildcard: false, index: false });
  for (const route of ['/', '/control', '/tv', '/gfx']) {
    app.get(route, (_req, reply) => reply.sendFile('index.html'));
  }
}

// ---- data -------------------------------------------------------------------

if (config.simulate) {
  startPoller(simBase, { once: true });
  startSim();
} else {
  startPoller((races) => store.ingest(races));
}

await app.listen({ port: config.port, host: config.host });
console.log(`electionsmap listening on :${config.port}${config.simulate ? ' (SIMULATION)' : ''}`);
