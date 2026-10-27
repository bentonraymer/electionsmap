import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Action, BoardSet, PublicState, RaceMeta } from '../../../shared/types';
import { PARTY_LABEL } from '../../../shared/types';
import { Logo } from '../components/Logo';
import { GfxScreen, TvScreen } from '../components/Screens';
import { Stage } from '../components/Stage';
import { BOARD_LABEL, boardRaces, raceView } from '../derive';
import { act, fmt, pct, useLiveState } from '../live';
import { candidateColor } from '../theme';
import './control.css';

type Tab = BoardSet | 'house' | 'search';
const TABS: [Tab, string][] = [
  ['key', 'Key'], ['ok', 'Oklahoma'], ['senate', 'Senate'], ['governor', 'Gov'], ['house', 'House'], ['watch', 'Watch'], ['search', 'Search'],
];

export function Control() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  useEffect(() => { fetch('/api/me').then((r) => r.json()).then((d) => setAuthed(d.authed)).catch(() => setAuthed(false)); }, []);
  if (authed === null) return null;
  return authed ? <Desk /> : <Login onOk={() => setAuthed(true)} />;
}

function Login({ onOk }: { onOk: () => void }) {
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
      <h1>Election Night Control</h1>
      <input type="password" autoFocus placeholder="Password" value={pw} onChange={(e) => setPw(e.target.value)} />
      <button className="btn primary" type="submit">Sign in</button>
      {err && <div className="err">{err}</div>}
    </form>
  );
}

function useToast() {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { if (!msg) return; const t = setTimeout(() => setMsg(null), 3500); return () => clearTimeout(t); }, [msg]);
  return [msg, setMsg] as const;
}

function Desk() {
  const { state: s, connected } = useLiveState();
  const [tab, setTab] = useState<Tab>('key');
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState<number | undefined>();
  const [toast, setToast] = useToast();

  const run = useCallback(async (a: Action) => {
    try { await act(a); } catch (e) {
      const m = (e as Error).message;
      if (/logged in/i.test(m)) location.reload();
      setToast(m);
    }
  }, [setToast]);

  const list = useMemo<RaceMeta[]>(() => {
    if (!s || tab === 'search') return [];
    const base = tab === 'house'
      ? s.races.filter((r) => r.category === 'house').sort((a, b) => (a.district ?? '').localeCompare(b.district ?? ''))
      : boardRaces(s, tab);
    const f = filter.trim().toLowerCase();
    if (!f) return base;
    return base.filter((r) => `${r.title} ${r.short} ${s.results[r.id]?.candidates.map((c) => c.name).join(' ')}`.toLowerCase().includes(f));
  }, [s, tab, filter]);

  // Keyboard: ↑/↓ select · Enter take to TV · L lower third · T ticker · B BoP bug · Esc clear gfx
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (!s) return;
      const el = e.target as HTMLElement;
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return;
      const i = list.findIndex((r) => r.id === selected);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const next = list[Math.max(0, Math.min(list.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))];
        if (next) { setSelected(next.id); document.getElementById(`race-${next.id}`)?.scrollIntoView({ block: 'nearest' }); }
      } else if (e.key === 'Enter' && selected) run({ type: 'tv', view: 'race', raceId: selected });
      else if (e.key.toLowerCase() === 'l' && selected) run({ type: 'lowerThird', on: !(s.show.gfx.lowerThird.on && s.show.gfx.lowerThird.raceId === selected), raceId: selected });
      else if (e.key.toLowerCase() === 't') run({ type: 'ticker', on: !s.show.gfx.ticker.on });
      else if (e.key.toLowerCase() === 'b') run({ type: 'bopBug', on: !s.show.gfx.bop.on });
      else if (e.key === 'Escape') run({ type: 'clearGfx' });
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [s, list, selected, run]);

  if (!s) return <div className="loading">Connecting…</div>;

  const stale = !s.health.lastSuccess || Date.now() - new Date(s.health.lastSuccess).getTime() > 120_000;
  const pendingAlerts = s.alerts.filter((a) => a.status === 'pending');

  return (
    <div className="desk">
      <header className="topbar">
        <Logo className="tb-logo" />
        <div className="tb-title">Election Night Control</div>
        <div className={`pill ${!connected ? 'bad' : stale || s.health.lastError ? 'warn' : 'ok'}`} title={s.health.lastError ?? ''}>
          {!connected ? 'Server disconnected' : s.health.source === 'simulation' ? 'SIMULATION' : stale ? 'Feed stale' : 'Feed live'}
          {s.health.lastSuccess && <span> · {new Date(s.health.lastSuccess).toLocaleTimeString()}</span>}
        </div>
        <label className="toggle"><input type="checkbox" checked={s.settings.frozen} onChange={(e) => run({ type: 'settings', patch: { frozen: e.target.checked } })} /> Freeze feed</label>
        <label className="toggle"><input type="checkbox" checked={s.settings.autoAirAlerts} onChange={(e) => run({ type: 'settings', patch: { autoAirAlerts: e.target.checked } })} /> Auto-air alerts</label>
        <div style={{ flex: 1 }} />
        <a className="tb-link" href="/tv" target="_blank">/tv ↗</a>
        <a className="tb-link" href="/gfx" target="_blank">/gfx ↗</a>
        <button className="btn ghost" onClick={() => fetch('/api/logout', { method: 'POST' }).then(() => location.reload())}>Sign out</button>
      </header>

      <aside className="col left">
        <div className="tabs">
          {TABS.map(([t, label]) => (
            <button key={t} className={`tab ${tab === t ? 'on' : ''}`} onClick={() => setTab(t)}>
              {label}{t === 'watch' && s.stars.length ? ` (${s.stars.length})` : ''}
            </button>
          ))}
        </div>
        {tab === 'search'
          ? <SearchPanel s={s} run={run} onPick={setSelected} />
          : (
            <>
              <input className="filter" placeholder="Filter races or candidates…" value={filter} onChange={(e) => setFilter(e.target.value)} />
              <div className="race-list">
                {list.map((r) => <RaceRow key={r.id} s={s} r={r} selected={selected === r.id} onClick={() => setSelected(r.id)} onTake={() => run({ type: 'tv', view: 'race', raceId: r.id })} run={run} />)}
                {!list.length && <div className="muted pad">{tab === 'watch' ? 'Star races to add them here.' : 'No races.'}</div>}
              </div>
            </>
          )}
        <div className="keys">↑↓ select · Enter → TV · L lower third · T ticker · B BoP · Esc clear GFX</div>
      </aside>

      <main className="col center">
        {selected ? <RaceDetail s={s} id={selected} run={run} /> : <div className="card muted">Select a race on the left.</div>}
        <div className="previews">
          <div className="preview">
            <div className="pv-label">TV · program</div>
            <Stage width={560} className="pv-tv"><TvScreen s={s} /></Stage>
          </div>
          <div className="preview">
            <div className="pv-label">GFX · key</div>
            <Stage width={560} className="pv-gfx"><GfxScreen s={s} /></Stage>
          </div>
        </div>
      </main>

      <aside className="col right">
        <TvControls s={s} run={run} selected={selected} />
        <GfxControls s={s} run={run} selected={selected} />
        <AlertsPanel s={s} run={run} pending={pendingAlerts.length} />
        <SettingsPanel s={s} run={run} />
      </aside>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

type Run = (a: Action) => void;

function RaceRow({ s, r, selected, onClick, onTake, run }: { s: PublicState; r: RaceMeta; selected: boolean; onClick: () => void; onTake: () => void; run: Run }) {
  const v = raceView(s, r.id)!;
  const lead = v.leader;
  const onTv = s.show.tv.view === 'race' && s.show.tv.raceId === r.id;
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

function RaceDetail({ s, id, run }: { s: PublicState; id: number; run: Run }) {
  const v = raceView(s, id);
  const res = s.results[id];
  const [edit, setEdit] = useState(false);
  const [pctIn, setPctIn] = useState('');
  const [votes, setVotes] = useState<Record<string, string>>({});
  useEffect(() => { setEdit(false); setPctIn(''); setVotes({}); }, [id]);
  if (!v) return <div className="card muted">Race not found.</div>;

  const applyOverride = () => {
    const vv: Record<string, number> = {};
    for (const [k, x] of Object.entries(votes)) if (x.trim() !== '') vv[k] = Number(x.replace(/,/g, ''));
    run({ type: 'override', raceId: id, pctReporting: pctIn.trim() === '' ? undefined : Number(pctIn), votes: Object.keys(vv).length ? vv : undefined });
    setEdit(false);
  };

  return (
    <div className="card detail">
      <div className="d-head">
        <div>
          <div className="d-title">{v.meta.title}</div>
          <div className="muted">
            {v.meta.office}{v.meta.priorParty && ` · seat held by ${PARTY_LABEL[v.meta.priorParty]}`} · {v.pctReporting}% in · {fmt(v.totalVotes)} votes
            {res?.overridden && <span className="ovr">MANUAL OVERRIDE</span>}
            {res?.lastUpdated && <> · feed {new Date(res.lastUpdated).toLocaleTimeString()}</>}
          </div>
        </div>
        <div className="d-actions">
          <button className="btn primary" onClick={() => run({ type: 'tv', view: 'race', raceId: id })}>Take to TV</button>
          <button className="btn" onClick={() => run({ type: 'lowerThird', on: true, raceId: id })}>Lower third</button>
        </div>
      </div>

      <table className="cands">
        <tbody>
          {v.cands.map((c) => {
            const won = v.called?.candidateId === c.id;
            return (
              <tr key={c.id} className={won ? 'won' : ''}>
                <td><span className="swatch" style={{ background: candidateColor(c.name, c.party) }} /></td>
                <td className="nm">{c.name} <span className="muted">{c.partyName || PARTY_LABEL[c.party]}{c.incumbent ? ' · inc' : ''}</span>
                  {c.feedWinner && !won && <span className="suggest">feed suggests winner</span>}</td>
                <td className="num r">{edit ? <input className="num-in" placeholder={String(c.votes)} value={votes[c.id] ?? ''} onChange={(e) => setVotes({ ...votes, [c.id]: e.target.value })} /> : fmt(c.votes)}</td>
                <td className="num r b">{pct(c.pct)}%</td>
                <td className="r">
                  {won
                    ? <button className="btn small" onClick={() => run({ type: 'uncall', raceId: id })}>Uncall</button>
                    : <button className="btn small call" onClick={() => {
                      const flip = v.meta.priorParty && c.party !== v.meta.priorParty && c.party !== 'N';
                      if (confirm(`Call ${v.meta.short} for ${c.name}?${flip ? '\n\nThis is a SEAT FLIP.' : ''}`)) run({ type: 'call', raceId: id, candidateId: c.id });
                    }}>Call</button>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="d-foot">
        {edit ? (
          <>
            <label>% reporting <input className="num-in" placeholder={String(v.pctReporting)} value={pctIn} onChange={(e) => setPctIn(e.target.value)} /></label>
            <button className="btn primary small" onClick={applyOverride}>Apply override</button>
            <button className="btn small" onClick={() => setEdit(false)}>Cancel</button>
          </>
        ) : (
          <button className="btn small" onClick={() => setEdit(true)}>Override numbers…</button>
        )}
        {res?.overridden && <button className="btn small" onClick={() => run({ type: 'clearOverride', raceId: id })}>Clear override (back to feed)</button>}
      </div>
    </div>
  );
}

function Seg<T extends string>({ value, options, onPick }: { value: T; options: [T, string][]; onPick: (v: T) => void }) {
  return (
    <div className="seg">
      {options.map(([k, l]) => <button key={k} className={value === k ? 'on' : ''} onClick={() => onPick(k)}>{l}</button>)}
    </div>
  );
}

function TvControls({ s, run, selected }: { s: PublicState; run: Run; selected?: number }) {
  const tv = s.show.tv;
  const boards: [BoardSet, string][] = (['key', 'ok', 'watch', 'senate', 'governor'] as BoardSet[]).map((b) => [b, BOARD_LABEL[b]]);
  return (
    <section className="card">
      <h3>TV output</h3>
      <div className="row">
        <button className={`btn view ${tv.view === 'national' && tv.chamber === 'senate' ? 'live' : ''}`} onClick={() => run({ type: 'tv', view: 'national', chamber: 'senate' })}>Senate map</button>
        <button className={`btn view ${tv.view === 'national' && tv.chamber === 'governor' ? 'live' : ''}`} onClick={() => run({ type: 'tv', view: 'national', chamber: 'governor' })}>Governor map</button>
        <button className={`btn view ${tv.view === 'bop' ? 'live' : ''}`} onClick={() => run({ type: 'tv', view: 'bop' })}>Balance of power</button>
        <button className={`btn view ${tv.view === 'race' ? 'live' : ''}`} disabled={!selected && !tv.raceId} onClick={() => run({ type: 'tv', view: 'race', raceId: selected ?? tv.raceId })}>Race{selected ? ' (selected)' : ''}</button>
      </div>
      <div className="lbl">Big board</div>
      <div className="row">
        {boards.map(([b, l]) => (
          <button key={b} className={`btn view ${tv.view === 'board' && tv.board === b ? 'live' : ''}`} onClick={() => run({ type: 'tv', view: 'board', board: b })}>{l}</button>
        ))}
      </div>
    </section>
  );
}

function GfxControls({ s, run, selected }: { s: PublicState; run: Run; selected?: number }) {
  const g = s.show.gfx;
  const ltRace = g.lowerThird.raceId ? s.races.find((r) => r.id === g.lowerThird.raceId) : undefined;
  return (
    <section className="card">
      <h3>GFX key <button className="btn small danger" style={{ float: 'right' }} onClick={() => run({ type: 'clearGfx' })}>Clear all (Esc)</button></h3>
      <div className="gfx-line">
        <button className={`btn cue ${g.lowerThird.on ? 'live' : ''}`} disabled={!g.lowerThird.raceId && !selected}
          onClick={() => run({ type: 'lowerThird', on: !g.lowerThird.on, raceId: g.lowerThird.on ? undefined : selected ?? g.lowerThird.raceId })}>Lower third</button>
        <span className="muted">{ltRace ? ltRace.short : 'no race cued'}</span>
        {selected && selected !== g.lowerThird.raceId && <button className="btn small" onClick={() => run({ type: 'lowerThird', on: g.lowerThird.on, raceId: selected })}>Cue selected</button>}
      </div>
      <div className="gfx-line">
        <button className={`btn cue ${g.ticker.on ? 'live' : ''}`} onClick={() => run({ type: 'ticker', on: !g.ticker.on })}>Ticker</button>
        <select value={g.ticker.set} onChange={(e) => run({ type: 'ticker', on: g.ticker.on, set: e.target.value as BoardSet })}>
          {(['key', 'ok', 'watch', 'senate', 'governor'] as BoardSet[]).map((b) => <option key={b} value={b}>{BOARD_LABEL[b]}</option>)}
        </select>
      </div>
      <div className="gfx-line">
        <button className={`btn cue ${g.bop.on ? 'live' : ''}`} onClick={() => run({ type: 'bopBug', on: !g.bop.on })}>BoP bug</button>
        <Seg value={g.bop.alternate ? 'alt' : g.bop.chamber} options={[['senate', 'Senate'], ['house', 'House'], ['alt', 'Alternate']]}
          onPick={(c) => run(c === 'alt' ? { type: 'bopBug', on: g.bop.on, alternate: true } : { type: 'bopBug', on: g.bop.on, chamber: c, alternate: false })} />
        {g.bop.alternate && <label className="muted">every <input className="num-in" style={{ width: 56 }} type="number" min={3} max={120} value={g.bop.seconds ?? 10}
          onChange={(e) => run({ type: 'bopBug', on: g.bop.on, seconds: Number(e.target.value) || 10 })} /> s</label>}
      </div>
    </section>
  );
}

function AlertsPanel({ s, run, pending }: { s: PublicState; run: Run; pending: number }) {
  const [text, setText] = useState('');
  const [sub, setSub] = useState('');
  const onAir = s.show.banner?.alertId;
  const visible = s.alerts.filter((a) => a.status !== 'dismissed').slice(0, 12);
  return (
    <section className="card">
      <h3>Alerts {pending > 0 && <span className="badge">{pending} waiting</span>}
        {onAir && <button className="btn small danger" style={{ float: 'right' }} onClick={() => run({ type: 'clearBanner' })}>Take banner off</button>}
      </h3>
      <form className="breaking" onSubmit={(e) => { e.preventDefault(); if (text.trim()) { run({ type: 'breaking', text: text.trim(), sub: sub.trim() || undefined }); setText(''); setSub(''); } }}>
        <input placeholder="Breaking headline…" value={text} onChange={(e) => setText(e.target.value)} />
        <input placeholder="Subline (optional)" value={sub} onChange={(e) => setSub(e.target.value)} />
        <button className="btn primary small" type="submit">Air breaking</button>
      </form>
      <div className="alerts">
        {visible.map((a) => (
          <div key={a.id} className={`alert ${a.status} ${onAir === a.id ? 'onair' : ''}`}>
            <div className="a-kind">{a.kind === 'flip' ? 'FLIP' : a.kind.toUpperCase()}</div>
            <div className="a-text"><b>{a.text}</b>{a.sub && <div className="muted">{a.sub}</div>}</div>
            <div className="a-btns">
              <button className="btn small primary" onClick={() => run({ type: 'airAlert', id: a.id })}>{a.status === 'aired' ? 'Re-air' : 'Air'}</button>
              <button className="btn small" onClick={() => run({ type: 'dismissAlert', id: a.id })}>✕</button>
            </div>
          </div>
        ))}
        {!visible.length && <div className="muted">Race calls, seat flips and control projections appear here.</div>}
      </div>
    </section>
  );
}

function SettingsPanel({ s, run }: { s: PublicState; run: Run }) {
  return (
    <section className="card">
      <h3>Settings</h3>
      <div className="gfx-line">
        <label>Banner seconds <input className="num-in" type="number" min={3} max={120} value={s.settings.bannerSeconds}
          onChange={(e) => run({ type: 'settings', patch: { bannerSeconds: Number(e.target.value) || 12 } })} /></label>
      </div>
      <button className="btn small danger" onClick={() => {
        if (confirm('Clear ALL race calls, overrides and alerts? (Use after a rehearsal.)')) run({ type: 'resetNight' });
      }}>Reset calls, overrides & alerts</button>
    </section>
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
