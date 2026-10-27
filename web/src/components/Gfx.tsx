import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Alert, BalanceOfPower, BoardSet, PublicState, ShowState } from '../../../shared/types';
import { PARTY_LABEL } from '../../../shared/types';
import { BOARD_LABEL, boardRaces, lastName, raceView, type RaceView } from '../derive';
import { pct } from '../live';
import { candidateColor, partyColor } from '../theme';
import { Logo } from './Logo';
import { Shards } from './Presence';

// One period of the drifting 45° bands from the TUTV name super: [left px, width px, colour class].
const BAND_PERIOD = 1000;
const BANDS: [number, number, string][] = [
  [0, 150, 'b'], [175, 110, 'y'], [330, 70, 'g'], [450, 170, 'w'], [660, 120, 'b'], [800, 90, 'y'], [920, 40, 'g'],
];

/** Slowly drifting stepped 45° bands (pastel blue / pale yellow / grey / white), as in the name-super package. */
export function Bands({ className = '' }: { className?: string }) {
  return (
    <div className={`bands ${className}`}>
      <div className="bands-strip">
        {[0, 1, 2].flatMap((k) => BANDS.map(([x, w, c], i) => (
          <i key={`${k}-${i}`} className={c} style={{ left: x + k * BAND_PERIOD, width: `calc(${w}px + var(--h) + 18px)` }} />
        )))}
      </div>
    </div>
  );
}

/** Permanent TUTV box at bottom left; the lower third and ticker sit beside it. */
export function GfxLogo() {
  return <div className="gfx-logo"><Bands /><Logo /></div>;
}

/** Shrinks text (down to `min` px) until it fits its box in at most `lines` lines. */
function FitText({ text, max, min, lines, className }: { text: string; max: number; min: number; lines: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    for (let size = max; size >= min; size--) {
      el.style.fontSize = `${size}px`;
      if (el.scrollHeight <= size * 1.1 * lines + 1 && el.scrollWidth <= el.clientWidth) break;
    }
  }, [text, max, min, lines]);
  return <div ref={ref} className={className}>{text}</div>;
}

/** Race lower third, built on the TUTV name-super geometry. */
export function LowerThird({ v }: { v: RaceView }) {
  const cands = v.cands.slice(0, v.cands.length > 2 && v.cands[2].pct > 10 ? 3 : 2);
  return (
    <div className={`lt ${cands.length > 2 ? 'three' : ''}`}>
      <div className="lt-bar reveal"><Bands className="end" /></div>
      <div className="lt-content fade">
        <div className="lt-race">
          <FitText className="t" text={v.meta.title} max={30} min={19} lines={2} />
          <div className="s">{v.called ? (v.flip ? `${PARTY_LABEL[v.called.party]} pickup` : 'Projected winner') : v.hasVotes ? 'Unofficial results' : 'Awaiting results'}</div>
        </div>
        <div className="lt-cands">
          {cands.map((c) => {
            const color = candidateColor(c.name, c.party);
            const won = v.called?.candidateId === c.id;
            return (
              <div key={c.id} className="lt-cand">
                <div className="chip" style={{ background: color }} />
                <div className="nm">
                  {c.name}
                  <small>{c.party === 'N' ? '' : PARTY_LABEL[c.party]}{c.incumbent ? ' · INC' : ''}</small>
                </div>
                {won && <span className="ck" style={{ background: color }}>✓</span>}
                <div className="pc num">{v.hasVotes ? `${pct(c.pct)}%` : ''}</div>
              </div>
            );
          })}
        </div>
        <div className="lt-rep">
          <div className="v num">{v.pctReporting}%</div>
          <div className="l">Reporting</div>
        </div>
      </div>
      <Shards />
    </div>
  );
}

function tickerItem(v: RaceView) {
  const top = v.cands.slice(0, 2);
  return (
    <span className="item" key={v.meta.id}>
      <b>{v.meta.short}</b>
      {top.map((c) => (
        <span key={c.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <span className="sw" style={{ background: candidateColor(c.name, c.party) }} />
          {v.called?.candidateId === c.id ? '✓ ' : ''}{lastName(c.name)}{v.hasVotes ? ` ${pct(c.pct)}%` : ''}
        </span>
      ))}
      <span className="rp num">{v.called ? 'CALLED' : v.hasVotes ? `${v.pctReporting}% IN` : 'NO RESULTS'}</span>
    </span>
  );
}

/** Continuous crawl; speed is constant regardless of content length. */
export function Ticker({ s, set }: { s: PublicState; set: BoardSet }) {
  const races = boardRaces(s, set).map((r) => raceView(s, r.id)).filter(Boolean) as RaceView[];
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => { if (ref.current) setW(ref.current.scrollWidth / 2); });
  const x = useRef(0);
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const step = (now: number) => {
      x.current -= ((now - last) / 1000) * 110;
      last = now;
      if (w && -x.current >= w) x.current += w;
      if (ref.current) ref.current.style.transform = `translateX(${x.current}px)`;
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [w]);
  const items = races.map((v) => [tickerItem(v), <span className="sep" key={'s' + v.meta.id} />]).flat();
  return (
    <div className="ticker">
      <div className="tag reveal">{BOARD_LABEL[set].toUpperCase()}</div>
      <div className="lane reveal">
        <Bands className="end" />
        <div className="crawl fade" ref={ref}>{items}{items.map((el, i) => <span key={'b' + i} style={{ display: 'contents' }}>{el}</span>)}</div>
        <Shards />
      </div>
    </div>
  );
}

function BopFace({ b, on }: { b: BalanceOfPower; on: boolean }) {
  const D = b.holdover.D + b.won.D;
  const R = b.holdover.R + b.won.R;
  return (
    <div className={`bug-face ${on ? 'on' : ''}`}>
      <div className="bug-head reveal">{b.chamber === 'senate' ? 'U.S. SENATE' : 'U.S. HOUSE'}<span>{b.majority} TO WIN</span></div>
      <div className="bug-body reveal">
        <div className="bug-nums fade">
          <span className="d num" style={{ color: partyColor.D }}>{D}</span>
          <span className="u num">{b.uncalled} UNCALLED</span>
          <span className="r num" style={{ color: partyColor.R }}>{R}</span>
        </div>
        <div className="bug-track fade">
          <div style={{ width: `${(D / b.total) * 100}%`, background: partyColor.D }} />
          <div style={{ flex: 1 }} />
          <div style={{ width: `${(R / b.total) * 100}%`, background: partyColor.R }} />
          <div className="mid" />
        </div>
      </div>
    </div>
  );
}

/** Which chamber the bug shows now; when alternating, every output flips on the same wall-clock beat. */
function useBopChamber(cfg: ShowState['gfx']['bop']) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!cfg.alternate) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [cfg.alternate]);
  if (!cfg.alternate) return cfg.chamber;
  return Math.floor(now / ((cfg.seconds ?? 10) * 1000)) % 2 ? 'house' : 'senate';
}

export function BopBug({ s }: { s: PublicState }) {
  const current = useBopChamber(s.show.gfx.bop);
  return (
    <div className="bug">
      <BopFace b={s.bop.senate} on={current === 'senate'} />
      <BopFace b={s.bop.house} on={current === 'house'} />
      <Shards />
    </div>
  );
}

/** Alert plate: lands on top of the lower-third slot in red so it reads as new. */
export function Banner({ a }: { a: Alert }) {
  const kindLabel = { call: 'RACE CALL', flip: 'SEAT FLIP', control: 'PROJECTION', breaking: 'BREAKING' }[a.kind];
  return (
    <div className="banner">
      <div className="kind reveal">
        {a.kind === 'flip' ? a.title : kindLabel}
        <small>ELECTION 2026</small>
      </div>
      <div className="msg reveal">
        <Bands className="end on-red" />
        <div className="h fade">
          {a.party && a.kind !== 'breaking' && <span className="chip" style={{ background: partyColor[a.party] }} />}
          {a.text}
        </div>
        {a.sub && <div className="s fade">{a.sub}</div>}
      </div>
      <Shards />
    </div>
  );
}
