import { useEffect, useState } from 'react';
import type { BalanceOfPower, BoardSet, PublicState, RegionResult } from '../../../shared/types';
import { PARTY_LABEL } from '../../../shared/types';
import { boardRaces, raceView, type RaceView } from '../derive';
import { fmt, pct } from '../live';
import { candidateColor, partyColor, partyTint } from '../theme';

const partyLine = (partyName: string, party: keyof typeof PARTY_LABEL) =>
  party === 'O' ? partyName : party === 'N' ? '' : partyName || PARTY_LABEL[party];

/** Candidate plates for the race view on /tv. */
export function ResultsPanel({ v, max = 4 }: { v: RaceView; max?: number }) {
  const shown = v.cands.slice(0, max);
  return (
    <div className="results">
      {shown.map((c, i) => {
        const won = v.called?.candidateId === c.id;
        const color = candidateColor(c.name, c.party);
        return (
          <div key={c.id} className={`cand plate cut ${won ? 'winner' : v.called ? 'loser' : ''}`} style={{ animation: `fade-in 0.5s ${i * 0.08}s both` }}>
            <div className="bar" style={{ background: color }} />
            <div className="who">
              <div className="name">
                {won && <span className="check" style={{ background: color }}>✓</span>}
                {c.name}
              </div>
              <div className="meta">
                {partyLine(c.partyName, c.party)}
                {c.incumbent && <span className="inc">· Incumbent</span>}
              </div>
            </div>
            <div className="nums num">
              <div className="pct">{pct(c.pct)}<small>%</small></div>
              <div className="votes">{fmt(c.votes)} votes</div>
            </div>
          </div>
        );
      })}
      {v.cands.length === 0 && <div className="cand plate cut"><div /><div className="who"><div className="name">Awaiting candidates</div></div></div>}
    </div>
  );
}

/** "Oklahoma" → "Oklahoma County" for on-air titles; leaves parishes, boroughs and cities alone. */
const countyTitle = (name: string) => /county|parish|borough|city|census|municipality/i.test(name) ? name : `${name} County`;

/** A county's results dressed as a RaceView (no call: winners are only called statewide). */
export function countyView(v: RaceView, r: RegionResult): RaceView {
  const cands = [...r.candidates].sort((a, b) => b.votes - a.votes).map((c) => {
    const race = v.cands.find((x) => x.name === c.name);
    return { id: c.name, name: c.name, party: c.party, partyName: race?.partyName ?? '', incumbent: race?.incumbent, votes: c.votes, pct: c.pct };
  });
  const totalVotes = cands.reduce((n, c) => n + c.votes, 0);
  return { ...v, cands, leader: cands[0], called: undefined, flip: false, pctReporting: r.pctReporting, totalVotes, hasVotes: totalVotes > 0 };
}

/** Picked counties on /tv: one county gets full candidate plates, 2-4 get compact cards. */
export function CountyResults({ v, regions }: { v: RaceView; regions: RegionResult[] }) {
  if (regions.length === 1) {
    const cv = countyView(v, regions[0]);
    return (
      <>
        <div className="cty-title">{countyTitle(regions[0].name)}</div>
        <ResultsPanel v={cv} max={4} />
        <div style={{ marginTop: 30 }}><Reporting v={cv} /></div>
      </>
    );
  }
  return (
    <div className="cty-cards">
      {regions.map((r, i) => {
        const cv = countyView(v, r);
        return (
          <div key={r.name} className="cty-card" style={{ animation: `fade-in 0.5s ${i * 0.08}s both` }}>
            <div className="cty-head"><span className="t">{countyTitle(r.name)}</span><span className="r num">{r.pctReporting}% IN</span></div>
            <div className="plate tile-plate">
              {cv.cands.slice(0, 3).map((c, j) => (
                <div key={c.id} className="tile-row">
                  <div style={{ height: '100%', background: candidateColor(c.name, c.party) }} />
                  <div className="n" style={{ fontWeight: j === 0 && cv.hasVotes ? 600 : 400 }}>{c.name}</div>
                  <div className="p num">{cv.hasVotes ? `${pct(c.pct)}%` : ''}</div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function Reporting({ v }: { v: RaceView }) {
  return (
    <div className="reporting">
      <span className="num">{v.pctReporting}% expected vote in</span>
      <div className="track"><div className="fill" style={{ width: `${v.pctReporting}%` }} /></div>
      <span className="num">{fmt(v.totalVotes)} votes</span>
    </div>
  );
}

function Tile({ v, delay }: { v: RaceView; delay: number }) {
  const status = v.called ? partyColor[v.called.party] : v.hasVotes && v.leader ? partyTint[v.leader.party] : 'rgba(255,255,255,0.25)';
  const rows = v.cands.slice(0, v.cands.length > 2 && v.cands[2].pct > 8 ? 3 : 2);
  return (
    <div className="tile" style={{ animationDelay: `${delay}s` }}>
      <div className="tile-head" style={{ borderTopColor: status }}>
        <span className="t">{v.meta.short}</span>
        <span className="r num">
          {v.called ? (v.flip ? `${PARTY_LABEL[v.called.party]} PICKUP` : 'CALLED') : v.hasVotes ? `${v.pctReporting}% IN` : 'NO RESULTS'}
        </span>
      </div>
      <div className="plate tile-plate">
        {rows.map((c) => {
          const won = v.called?.candidateId === c.id;
          return (
            <div key={c.id} className="tile-row">
              <div style={{ height: '100%', background: candidateColor(c.name, c.party) }} />
              <div className="n" style={{ fontWeight: won ? 600 : 400 }}>{won && <span className="ck">✓</span>}{c.name}</div>
              <div className="p num">{v.hasVotes ? `${pct(c.pct)}%` : ''}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const PER_PAGE = 16;

/** Grid of race tiles that pages automatically. */
export function BigBoard({ s, set }: { s: PublicState; set: BoardSet }) {
  const races = boardRaces(s, set);
  const pages = Math.max(1, Math.ceil(races.length / PER_PAGE));
  const [page, setPage] = useState(0);
  useEffect(() => setPage(0), [set]);
  useEffect(() => {
    if (pages < 2) return;
    const t = setInterval(() => setPage((p) => (p + 1) % pages), 10000);
    return () => clearInterval(t);
  }, [pages]);
  const p = page % pages;
  const slice = races.slice(p * PER_PAGE, p * PER_PAGE + PER_PAGE);
  return (
    <>
      {pages > 1 && <div className="board-page num">{p + 1} / {pages}</div>}
      <div className="board" key={`${set}-${p}`}>
        {slice.map((r, i) => {
          const v = raceView(s, r.id);
          return v ? <Tile key={r.id} v={v} delay={i * 0.04} /> : null;
        })}
      </div>
      {!races.length && <div className="empty-msg">No races in this list yet</div>}
    </>
  );
}

/** Full-width balance-of-power bar. */
export function BopBar({ b, title, compact }: { b: BalanceOfPower; title: string; compact?: boolean }) {
  const D = b.holdover.D + b.won.D;
  const R = b.holdover.R + b.won.R;
  const I = b.holdover.I + b.won.I;
  const w = (n: number) => `${(n / b.total) * 100}%`;
  const notLeading = b.uncalled - b.leading.D - b.leading.R - b.leading.I;
  return (
    <div className={`bop ${compact ? 'compact' : ''}`}>
      {compact && <div className="center top">{title} · <span className="num">{b.majority}</span> for majority</div>}
      <div className="labels">
        <div className="side d"><div className="big num" style={{ color: '#9bb8f0' }}>{D}</div><div className="lbl">Democrats</div></div>
        {!compact && <div className="center">{title}<b className="num">{b.majority} for majority</b></div>}
        <div className="side r"><div className="big num" style={{ color: '#efa3a8' }}>{R}</div><div className="lbl">Republicans</div></div>
      </div>
      <div className="track">
        <div className="seg" style={{ width: w(D), background: partyColor.D }} />
        <div className="seg" style={{ width: w(b.leading.D), background: partyTint.D }} />
        <div className="seg" style={{ width: w(I), background: partyColor.I }} />
        <div className="seg" style={{ width: w(b.leading.I), background: partyTint.I }} />
        <div className="seg" style={{ width: w(notLeading), background: 'transparent' }} />
        <div className="seg" style={{ width: w(b.leading.R), background: partyTint.R }} />
        <div className="seg" style={{ width: w(R), background: partyColor.R }} />
        <div className="mid" style={{ left: `calc(50% - 1px)` }} />
      </div>
      {!compact && <div className="legend num">
        <span>{b.chamber === 'senate' ? `${b.holdover.D} not up · ${b.won.D} won` : `${b.won.D} won`} · {b.leading.D} leading</span>
        <span>{b.uncalled} uncalled{I ? ` · ${I} other` : ''}</span>
        <span>{b.leading.R} leading · {b.chamber === 'senate' ? `${b.won.R} won · ${b.holdover.R} not up` : `${b.won.R} won`}</span>
      </div>}
      {compact && <div className="legend num"><span>{b.uncalled} races uncalled</span><span>{b.leading.D} D · {b.leading.R} R leading</span></div>}
    </div>
  );
}

/** Compact list of races (used beside the national map). */
export function RaceList({ s, ids }: { s: PublicState; ids: number[] }) {
  return (
    <div className="mini-list">
      {ids.map((id) => {
        const v = raceView(s, id);
        if (!v) return null;
        const lead = v.called ? v.cands.find((c) => c.id === v.called!.candidateId) : v.leader;
        const color = v.called ? partyColor[v.called.party] : v.hasVotes && lead ? partyTint[lead.party] : 'rgba(255,255,255,0.25)';
        return (
          <div key={id} className="mini-row">
            <span className="sw" style={{ background: color }} />
            <span className="st">{v.meta.short}</span>
            <span className="nm">{v.hasVotes || v.called ? `${v.called ? '✓ ' : ''}${lead?.name ?? ''}` : 'No results yet'}</span>
            <span className="pc num">{v.hasVotes && lead ? `${pct(lead.pct)}%` : ''}</span>
          </div>
        );
      })}
    </div>
  );
}
