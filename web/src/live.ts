import { useEffect, useRef, useState } from 'react';
import type { Action, PublicState } from '../../shared/types';

/** Subscribes to the server's snapshot stream; reconnects forever (displays must self-heal). */
export function useLiveState() {
  const [state, setState] = useState<PublicState | null>(null);
  const [connected, setConnected] = useState(false);
  const offset = useRef(0);

  useEffect(() => {
    let ws: WebSocket | undefined;
    let retry: number | undefined;
    let ping: number | undefined;
    let closed = false;
    const token = new URLSearchParams(location.search).get('token');

    const connect = () => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      ws = new WebSocket(`${proto}://${location.host}/ws${token ? `?token=${encodeURIComponent(token)}` : ''}`);
      ws.onopen = () => setConnected(true);
      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg.type === 'snapshot') {
          offset.current = msg.data.serverTime - Date.now();
          setState(msg.data);
        }
      };
      ws.onclose = () => {
        setConnected(false);
        if (!closed) retry = window.setTimeout(connect, 1500);
      };
      ws.onerror = () => ws?.close();
    };
    connect();
    ping = window.setInterval(() => ws?.readyState === 1 && ws.send('ping'), 20000);
    return () => { closed = true; clearTimeout(retry); clearInterval(ping); ws?.close(); };
  }, []);

  return { state, connected };
}

export async function act(action: Action) {
  const res = await fetch('/api/action', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(action),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? res.statusText);
}

export const fmt = (n: number) => n.toLocaleString('en-US');
export const pct = (n: number) => (n >= 99.95 || n === 0 ? n.toFixed(0) : n.toFixed(1));
