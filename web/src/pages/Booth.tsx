// /booth: booth producers run the key: GFX layers, the lower third and the alert queue.
import { useEffect, useState } from 'react';
import type { BoardSet, PublicState } from '../../../shared/types';
import { GfxScreen, TvScreen } from '../components/Screens';
import { Stage } from '../components/Stage';
import { BOARD_LABEL } from '../derive';
import { Desk, RaceBrowser, Seg, Topbar, type Run } from './common';

export function Booth() {
  return <Desk title="Election Night Booth">{(s, run, connected) => <BoothDesk s={s} run={run} connected={connected} />}</Desk>;
}

function BoothDesk({ s, run, connected }: { s: PublicState; run: Run; connected: boolean }) {
  const [selected, setSelected] = useState<number | undefined>(s.show.gfx.lowerThird.raceId);
  const pending = s.alerts.filter((a) => a.status === 'pending').length;

  // L lower third · T ticker · B BoP bug · Esc clear (↑/↓/Enter live in the race browser)
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return;
      const lt = s.show.gfx.lowerThird;
      if (e.key.toLowerCase() === 'l' && selected) run({ type: 'lowerThird', on: !(lt.on && lt.raceId === selected), raceId: selected });
      else if (e.key.toLowerCase() === 't') run({ type: 'ticker', on: !s.show.gfx.ticker.on });
      else if (e.key.toLowerCase() === 'b') run({ type: 'bopBug', on: !s.show.gfx.bop.on });
      else if (e.key === 'Escape') run({ type: 'clearGfx' });
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [s, selected, run]);

  return (
    <div className="desk">
      <Topbar s={s} connected={connected} title="Booth">
        <label className="toggle"><input type="checkbox" checked={s.settings.autoAirAlerts} onChange={(e) => run({ type: 'settings', patch: { autoAirAlerts: e.target.checked } })} /> Auto-air alerts</label>
      </Topbar>
      <RaceBrowser s={s} run={run} selected={selected} onSelect={setSelected}
        onEnter={(id) => run({ type: 'lowerThird', on: true, raceId: id })}
        hint="↑↓ select · Enter → lower third · L toggle LT · T ticker · B BoP · Esc clear GFX" />
      <main className="col center">
        <div className="preview">
          <div className="pv-label">GFX · key</div>
          <Stage width={760} className="pv-gfx"><GfxScreen s={s} /></Stage>
        </div>
        <div className="preview">
          <div className="pv-label">TV · program</div>
          <Stage width={480} className="pv-tv"><TvScreen s={s} /></Stage>
        </div>
      </main>
      <aside className="col right">
        <GfxControls s={s} run={run} selected={selected} />
        <AlertsPanel s={s} run={run} pending={pending} />
      </aside>
    </div>
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
        {g.ticker.set === 'ok' && <label className="toggle muted">
          <input type="checkbox" checked={s.settings.hideJudges} onChange={(e) => run({ type: 'settings', patch: { hideJudges: e.target.checked } })} /> no judges
        </label>}
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
        {!visible.length && <div className="muted">Race calls from the studio, seat flips and control projections appear here.</div>}
      </div>
      <div className="gfx-line" style={{ marginTop: 10 }}>
        <label className="muted">Banner stays up <input className="num-in" style={{ width: 64 }} type="number" min={3} max={120} value={s.settings.bannerSeconds}
          onChange={(e) => run({ type: 'settings', patch: { bannerSeconds: Number(e.target.value) || 12 } })} /> s</label>
      </div>
    </section>
  );
}
