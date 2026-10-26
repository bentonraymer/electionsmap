import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Alert, BalanceOfPower, BoardSet, PublicState } from '../../../shared/types';
import { PARTY_LABEL } from '../../../shared/types';
import { BOARD_LABEL, boardRaces, lastName, raceView, type RaceView } from '../derive';
import { pct } from '../live';
import { brand, candidateColor, partyColor } from '../theme';
import { Logo } from './Logo';
import { Shards } from './Presence';

/** Race lower third, built on the TUTV name-super geometry. */
export function LowerThird({ v }: { v: RaceView }) {
  const cands = v.cands.slice(0, v.cands.length > 2 && v.cands[2].pct > 10 ? 3 : 2);
  return (
    <div className="lt">
      <div className="lt-logo reveal"><Logo /></div>
      <div className="lt-bar reveal" />
      <div className="lt-content fade">
        <div className="lt-race">
          <div className="t">{v.meta.title.replace(/^Oklahoma /, v.meta.state === 'ok' ? 'Oklahoma ' : '')}</div>
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
        <div className="crawl fade" ref={ref}>{items}{items.map((el, i) => <span key={'b' + i} style={{ display: 'contents' }}>{el}</span>)}</div>
        <Shards />
      </div>
    </div>
  );
}

export function BopBug({ b }: { b: BalanceOfPower }) {
  const D = b.holdover.D + b.won.D;
  const R = b.holdover.R + b.won.R;
  return (
    <div className="bug">
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
      <Shards />
    </div>
  );
}

export function Banner({ a }: { a: Alert }) {
  const bg = a.kind === 'breaking' ? brand.navy : a.party ? partyColor[a.party] : brand.navy;
  const kindLabel = { call: 'RACE CALL', flip: 'SEAT FLIP', control: 'PROJECTION', breaking: 'BREAKING' }[a.kind];
  return (
    <div className="banner">
      <div className="kind reveal" style={{ background: bg }}>
        {a.kind === 'flip' ? a.title : kindLabel}
        <small>TUTV ELECTION 2026</small>
      </div>
      <div className="msg reveal">
        <div className="h fade">{a.text}</div>
        {a.sub && <div className="s fade">{a.sub}</div>}
      </div>
      <Shards />
    </div>
  );
}
