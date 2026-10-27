// Pieces shared by /studio (analysts) and /booth (producers): sign-in, top bar, race browser.
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Action, BoardSet, PublicState, RaceMeta } from '../../../shared/types';
import { Logo } from '../components/Logo';
import { boardRaces, raceView } from '../derive';
import { act, pct, useLiveState } from '../live';
import { candidateColor } from '../theme';
import './control.css';

export type Run = (a: Action) => void;

/** Password gate around a desk page; renders `children(state, run)` once signed in and connected. */
export function Desk({ title, children }: { title: string; children: (s: PublicState, run: Run, connected: boolean) => ReactNode }) {
  const [authed, setAuthed] = useState<boolean | null>(null);
  useEffect(() => { fetch('/api/me').then((r) => r.json()).then((d) => setAuthed(d.authed)).catch(() => setAuthed(false)); }, []);
  if (authed === null) return null;
  return authed ? <Live children={children} /> : <Login title={title} onOk={() => setAuthed(true)} />;
}

function Live({ children }: { children: (s: PublicState, run: Run, connected: boolean) => ReactNode }) {
  const { state: s, connected } = useLiveState();
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 3500); return () => clearTimeout(t); }, [toast]);
  const run = useCallback(async (a: Action) => {
    try { await act(a); } catch (e) {
      const m = (e as Error).message;
      if (/logged in/i.test(m)) location.reload();
      setToast(m);
    }
  }, []);
  if (!s) return <div className="loading">Connecting…</div>;
  return <>{children(s, run, connected)}{toast && <div className="toast">{toast}</div>}</>;
}

function Login({ title, onOk }: { title: string; onOk: () => void }) {
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: pw }) });
    if (r.ok) onOk(); else setErr('Wrong password');
  };
  return (
    <form className="login" onSubmit={submit}>
      <Logo className="login-logo" />
      <h1>{title}</h1>
      <input type="password" autoFocus placeholder="Password" value={pw} onChange={(e) => setPw(e.target.value)} />
      <button className="btn primary" type="submit">Sign in</button>
      {err && <div className="err">{err}</div>}
    </form>
  );
}

export function Topbar({ s, connected, title, children }: { s: PublicState; connected: boolean; title: string; children?: ReactNode }) {
  const stale = !s.health.lastSuccess || Date.now() - new Date(s.health.lastSuccess).getTime() > 120_000;
  const here = location.pathname.replace(/\/+$/, '');
  return (
    <header className="topbar">
      <Logo className="tb-logo" />
      <div className="tb-title">{title}</div>
      <div className={`pill ${!connected ? 'bad' : stale || s.health.lastError ? 'warn' : 'ok'}`} title={s.health.lastError ?? ''}>
        {!connected ? 'Server disconnected' : s.health.source === 'simulation' ? 'SIMULATION' : stale ? 'Feed stale' : 'Feed live'}
        {s.health.lastSuccess && <span> · {new Date(s.health.lastSuccess).toLocaleTimeString()}</span>}
      </div>
      {children}
      <div style={{ flex: 1 }} />
      {here !== '/studio' && <a className="tb-link" href="/studio">Studio</a>}
      {here !== '/booth' && <a className="tb-link" href="/booth">Booth</a>}
      <a className="tb-link" href="/tv" target="_blank">/tv ↗</a>
      <a className="tb-link" href="/gfx" target="_blank">/gfx ↗</a>
      <button className="btn ghost" onClick={() => fetch('/api/logout', { method: 'POST' }).then(() => location.reload())}>Sign out</button>
    </header>
  );
}

export function Seg<T extends string>({ value, options, onPick }: { value: T; options: [T, string][]; onPick: (v: T) => void }) {
  return (
    <div className="seg">
      {options.map(([k, l]) => <button key={k} className={value === k ? 'on' : ''} onClick={() => onPick(k)}>{l}</button>)}
    </div>
  );
}

type Tab = BoardSet | 'house' | 'search';
const TABS: [Tab, string][] = [
  ['key', 'Key'], ['ok', 'Oklahoma'], ['senate', 'Senate'], ['governor', 'Gov'], ['house', 'House'], ['watch', 'Watch'], ['search', 'Search'],
];

/**
 * Tabbed race list with filter, civicAPI search and ↑/↓ selection.
 * `onEnter` fires on Enter and on double-click (the page decides what "take" means).
 */
export function RaceBrowser({ s, run, selected, onSelect, onEnter, hint }: {
  s: PublicState; run: Run; selected?: number; onSelect: (id: number) => void; onEnter: (id: number) => void; hint: string;
}) {
  const [tab, setTab] = useState<Tab>('key');
  const [filter, setFilter] = useState('');
  const list = useMemo<RaceMeta[]>(() => {
    if (tab === 'search') return [];
    const base = tab === 'house'
      ? s.races.filter((r) => r.category === 'house').sort((a, b) => (a.district ?? '').localeCompare(b.district ?? ''))
      : boardRaces(s, tab, true);
    const f = filter.trim().toLowerCase();
    if (!f) return base;
    return base.filter((r) => `${r.title} ${r.short} ${s.results[r.id]?.candidates.map((c) => c.name).join(' ')}`.toLowerCase().includes(f));
  }, [s, tab, filter]);

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return;
      const i = list.findIndex((r) => r.id === selected);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const next = list[Math.max(0, Math.min(list.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))];
        if (next) { onSelect(next.id); document.getElementById(`race-${next.id}`)?.scrollIntoView({ block: 'nearest' }); }
      } else if (e.key === 'Enter' && selected) onEnter(selected);
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [list, selected, onSelect, onEnter]);

  return (
    <aside className="col left">
      <div className="tabs">
        {TABS.map(([t, label]) => (
          <button key={t} className={`tab ${tab === t ? 'on' : ''}`} onClick={() => setTab(t)}>
            {label}{t === 'watch' && s.stars.length ? ` (${s.stars.length})` : ''}
          </button>
        ))}
      </div>
      {tab === 'search'
        ? <SearchPanel s={s} run={run} onPick={onSelect} />
        : (
          <>
            <input className="filter" placeholder="Filter races or candidates…" value={filter} onChange={(e) => setFilter(e.target.value)} />
            <div className="race-list">
              {list.map((r) => <RaceRow key={r.id} s={s} r={r} selected={selected === r.id} onClick={() => onSelect(r.id)} onTake={() => onEnter(r.id)} run={run} />)}
              {!list.length && <div className="muted pad">{tab === 'watch' ? 'Star races to add them here.' : 'No races.'}</div>}
            </div>
          </>
        )}
      <div className="keys">{hint}</div>
    </aside>
  );
}

function RaceRow({ s, r, selected, onClick, onTake, run }: { s: PublicState; r: RaceMeta; selected: boolean; onClick: () => void; onTake: () => void; run: Run }) {
  const v = raceView(s, r.id)!;
  const lead = v.leader;
  const onTv = (s.show.tv.view === 'race' || s.show.tv.view === 'county') && s.show.tv.raceId === r.id;
  const onLt = s.show.gfx.lowerThird.on && s.show.gfx.lowerThird.raceId === r.id;
  const starred = s.stars.includes(r.id);
  const suggest = !v.called && v.cands.find((c) => c.feedWinner);
  return (
    <div id={`race-${r.id}`} className={`race-row ${selected ? 'sel' : ''}`} onClick={onClick} onDoubleClick={onTake}>
      <button className={`star ${starred ? 'on' : ''}`} title="Watch list" onClick={(e) => { e.stopPropagation(); run({ type: 'star', raceId: r.id, on: !starred }); }}>★</button>
      <div className="rr-main">
        <div className="rr-title">{r.short}{onTv && <span className="tally tally-tv">TV</span>}{onLt && <span className="tally tally-lt">LT</span>}</div>
        <div className="rr-sub">
          {v.called
            ? <><b style={{ color: candidateColor(v.called.name, v.called.party) }}>✓ {v.called.name}</b>{v.flip && <span className="flip">FLIP</span>}</>
            : lead && v.hasVotes
              ? <><span className="dot" style={{ background: candidateColor(lead.name, lead.party) }} />{lead.name} {pct(lead.pct)}%</>
              : <span className="muted">No results</span>}
          {suggest && <span className="suggest" title="The feed marks a winner; not on air until you call it">feed: {suggest.name}</span>}
        </div>
      </div>
      <div className="rr-rep num">{v.pctReporting}%</div>
    </div>
  );
}

interface Hit { id: number; title: string; type: string; state: string; date: string; pctReporting: number; candidates: { name: string; party: string }[] }

function SearchPanel({ s, run, onPick }: { s: PublicState; run: Run; onPick: (id: number) => void }) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [busy, setBusy] = useState(false);
  const [onlyNov3, setOnlyNov3] = useState(true);
  const go = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try { setHits(await (await fetch(`/api/search?q=${encodeURIComponent(q)}`)).json()); } finally { setBusy(false); }
  };
  const shown = Array.isArray(hits) ? hits.filter((h) => !onlyNov3 || h.date === '2026-11-03') : [];
  return (
    <>
      <form onSubmit={go} className="search">
        <input className="filter" placeholder="Search civicAPI, e.g. “Tulsa” or “Kansas Governor”" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn small primary" disabled={busy}>{busy ? '…' : 'Search'}</button>
      </form>
      <label className="toggle pad"><input type="checkbox" checked={onlyNov3} onChange={(e) => setOnlyNov3(e.target.checked)} /> Nov 3, 2026 only</label>
      <div className="race-list">
        {shown.map((h) => {
          const starred = s.stars.includes(h.id);
          const tracked = s.races.some((r) => r.id === h.id);
          return (
            <div key={h.id} className="race-row" onClick={() => tracked && onPick(h.id)}>
              <button className={`star ${starred ? 'on' : ''}`} onClick={(e) => {
                e.stopPropagation();
                run({ type: 'star', raceId: h.id, on: !starred, meta: { title: h.title, short: h.title.length > 26 ? h.title.slice(0, 24) + '…' : h.title, office: h.type, state: h.state } });
                if (!starred) onPick(h.id);
              }}>★</button>
              <div className="rr-main">
                <div className="rr-title">{h.title}</div>
                <div className="rr-sub muted">{h.type} · {h.date} · {h.candidates.slice(0, 3).map((c) => c.name).join(', ')}</div>
              </div>
            </div>
          );
        })}
        {!shown.length && <div className="muted pad">Star a result to track it, add it to the Watch list and poll it.</div>}
      </div>
    </>
  );
}
