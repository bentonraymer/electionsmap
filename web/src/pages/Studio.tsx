// /studio: analysts dig through results, call races, drill into counties and choose what is on the TV.
import { useEffect, useMemo, useState } from 'react';
import type { BoardSet, PublicState, RegionResult } from '../../../shared/types';
import { PARTY_LABEL } from '../../../shared/types';
import { StateMap } from '../components/Maps';
import { TvScreen } from '../components/Screens';
import { Stage } from '../components/Stage';
import { BOARD_LABEL, lastName, raceView } from '../derive';
import { fmt, pct } from '../live';
import { candidateColor } from '../theme';
import { Desk, RaceBrowser, Topbar, type Run } from './common';

const MAX_COUNTIES = 4;

export function Studio() {
  return <Desk title="Election Night Studio">{(s, run, connected) => <StudioDesk s={s} run={run} connected={connected} />}</Desk>;
}

function StudioDesk({ s, run, connected }: { s: PublicState; run: Run; connected: boolean }) {
  const [selected, setSelected] = useState<number | undefined>(s.show.tv.raceId);
  return (
    <div className="desk">
      <Topbar s={s} connected={connected} title="Studio">
        <label className="toggle"><input type="checkbox" checked={s.settings.frozen} onChange={(e) => run({ type: 'settings', patch: { frozen: e.target.checked } })} /> Freeze feed</label>
      </Topbar>
      <RaceBrowser s={s} run={run} selected={selected} onSelect={setSelected}
        onEnter={(id) => run({ type: 'tv', view: 'race', raceId: id })} hint="↑↓ select · Enter / double-click → race on TV" />
      <main className="col center">
        {selected
          ? <><RaceDetail s={s} id={selected} run={run} /><CountyExplorer key={selected} s={s} id={selected} run={run} /></>
          : <div className="card muted">Select a race on the left.</div>}
      </main>
      <aside className="col right">
        <div className="preview">
          <div className="pv-label">TV · program</div>
          <Stage width={354} className="pv-tv"><TvScreen s={s} /></Stage>
        </div>
        <TvControls s={s} run={run} selected={selected} />
        <section className="card">
          <h3>Rehearsal</h3>
          <button className="btn small danger" onClick={() => {
            if (confirm('Clear ALL race calls, overrides and alerts? (Use after a rehearsal.)')) run({ type: 'resetNight' });
          }}>Reset calls, overrides & alerts</button>
        </section>
      </aside>
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
          <button className="btn primary" onClick={() => run({ type: 'tv', view: 'race', raceId: id })}>Race to TV</button>
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

type SortKey = 'name' | 'in' | 'votes' | 'margin' | number;

/** County-level drill-down: table + clickable map; pick up to four counties and send them to the TV. */
function CountyExplorer({ s, id, run }: { s: PublicState; id: number; run: Run }) {
  const v = raceView(s, id)!;
  const tv = s.show.tv;
  const onTv = tv.view === 'county' && tv.raceId === id ? tv.counties ?? [] : null;
  const [regions, setRegions] = useState<Record<string, RegionResult>>({});
  const [loaded, setLoaded] = useState(false);
  const [picked, setPicked] = useState<string[]>(onTv ?? []);
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'name', desc: false }); // A–Z by default: rows don't jump under the cursor as votes update
  const [q, setQ] = useState('');

  // Fetching also tells the server to poll this race's county detail with priority while we look at it.
  useEffect(() => {
    let alive = true;
    const load = () => fetch(`/api/regions/${id}`).then((r) => r.json())
      .then((d) => { if (alive) { setRegions(d.regions ?? {}); setLoaded(true); } }).catch(() => {});
    load();
    const t = setInterval(load, 8000);
    return () => { alive = false; clearInterval(t); };
  }, [id]);

  const cols = v.cands.slice(0, 3);
  const rows = useMemo(() => Object.entries(regions).map(([key, r]) => {
    const cs = [...r.candidates].sort((a, b) => b.votes - a.votes);
    const votes = cs.reduce((n, c) => n + c.votes, 0);
    const byName = new Map(r.candidates.map((c) => [c.name, c]));
    return { key, r, votes, leader: votes ? cs[0] : undefined, margin: votes ? cs[0].pct - (cs[1]?.pct ?? 0) : 0, byName };
  }), [regions]);

  const shown = useMemo(() => {
    const f = q.trim().toLowerCase();
    const list = f ? rows.filter((x) => x.r.name.toLowerCase().includes(f)) : rows;
    const val = (x: (typeof rows)[number]): number | string =>
      sort.key === 'name' ? x.r.name : sort.key === 'in' ? x.r.pctReporting : sort.key === 'votes' ? x.votes
        : sort.key === 'margin' ? x.margin : x.byName.get(cols[sort.key]?.name ?? '')?.pct ?? 0;
    return [...list].sort((a, b) => {
      const A = val(a), B = val(b);
      const c = typeof A === 'string' ? A.localeCompare(B as string) : A - (B as number);
      return sort.desc ? -c : c;
    });
  }, [rows, q, sort, cols]);

  const toggle = (key: string) => setPicked((p) => p.includes(key) ? p.filter((k) => k !== key) : p.length < MAX_COUNTIES ? [...p, key] : p);
  const th = (key: SortKey, label: React.ReactNode, cls = '') => (
    <th className={`${cls} sortable ${sort.key === key ? 'on' : ''}`} onClick={() => setSort((x) => ({ key, desc: x.key === key ? !x.desc : key !== 'name' }))}>
      {label}{sort.key === key ? (sort.desc ? ' ▾' : ' ▴') : ''}
    </th>
  );
  const same = onTv && onTv.length === picked.length && onTv.every((k) => picked.includes(k));

  return (
    <section className="card counties">
      <h3>
        Counties <span className="muted cnt">{rows.length ? `${rows.length} reporting units · pick up to ${MAX_COUNTIES}` : ''}</span>
        <span className="h-btns">
          {onTv && <span className="tally tally-tv">COUNTIES ON TV</span>}
          <button className="btn small" disabled={!picked.length} onClick={() => setPicked([])}>Clear</button>
          <button className="btn small primary" disabled={!picked.length || !!same}
            onClick={() => run({ type: 'tv', view: 'county', raceId: id, counties: picked })}>
            {picked.length ? `Show ${picked.length} on TV` : 'Show on TV'}
          </button>
        </span>
      </h3>
      {!rows.length
        ? <div className="muted">{loaded ? 'No county breakdown for this race yet. It appears once the feed has county results.' : 'Loading county results…'}</div>
        : (
          <div className="cty-explore">
            <div className="cty-side">
              <div className="mini-map"><StateMap view={v} regions={regions} width={300} height={240} highlight={picked} onPick={toggle} /></div>
              <div className="picked">
                {picked.map((k) => <button key={k} className="chip-btn" onClick={() => toggle(k)}>{regions[k]?.name ?? k} ✕</button>)}
                {!picked.length && <span className="muted">Click counties on the map or tick them in the table.</span>}
              </div>
            </div>
            <div className="cty-table">
              <input className="filter" placeholder="Find a county…" value={q} onChange={(e) => setQ(e.target.value)} />
              <div className="cty-scroll">
                <table>
                  <thead>
                    <tr>
                      <th />
                      {th('name', 'County')}
                      {th('in', '% in', 'r')}
                      {cols.map((c, i) => th(i, <><span className="dot" style={{ background: candidateColor(c.name, c.party) }} />{lastName(c.name)}</>, 'r'))}
                      {th('margin', 'Margin', 'r')}
                      {th('votes', 'Votes', 'r')}
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((x) => {
                      const on = picked.includes(x.key);
                      return (
                        <tr key={x.key} className={on ? 'on' : ''} onClick={() => toggle(x.key)}>
                          <td><input type="checkbox" readOnly checked={on} disabled={!on && picked.length >= MAX_COUNTIES} /></td>
                          <td className="nm">{x.r.name}</td>
                          <td className="r num">{x.r.pctReporting}%</td>
                          {cols.map((c) => {
                            const rc = x.byName.get(c.name);
                            const lead = x.leader?.name === c.name;
                            return <td key={c.id} className={`r num ${lead ? 'b' : ''}`}>{rc && x.votes ? `${pct(rc.pct)}%` : '–'}</td>;
                          })}
                          <td className="r num">{x.leader
                            ? <><span className="dot" style={{ background: candidateColor(x.leader.name, x.leader.party) }} />+{x.margin.toFixed(1)}</>
                            : '–'}</td>
                          <td className="r num">{fmt(x.votes)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
    </section>
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
        {tv.view === 'county' && <button className="btn view live">Counties</button>}
      </div>
      <div className="lbl">Big board</div>
      <div className="row">
        {boards.map(([b, l]) => (
          <button key={b} className={`btn view ${tv.view === 'board' && tv.board === b ? 'live' : ''}`} onClick={() => run({ type: 'tv', view: 'board', board: b })}>{l}</button>
        ))}
      </div>
      <label className="toggle" style={{ marginTop: 8 }}>
        <input type="checkbox" checked={s.settings.hideJudges} onChange={(e) => run({ type: 'settings', patch: { hideJudges: e.target.checked } })} />
        Hide judicial retentions on the Oklahoma board & ticker
      </label>
    </section>
  );
}
