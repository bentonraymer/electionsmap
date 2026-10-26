import type { BoardSet, Candidate, Party, PublicState, RaceMeta } from '../../shared/types';

export interface RaceView {
  meta: RaceMeta;
  cands: Candidate[];
  pctReporting: number;
  totalVotes: number;
  called?: { candidateId: string; party: Party; name: string };
  leader?: Candidate;
  flip: boolean;
  hasVotes: boolean;
}

export function raceView(s: PublicState, id: number | undefined): RaceView | undefined {
  if (!id) return undefined;
  const meta = s.races.find((r) => r.id === id);
  if (!meta) return undefined;
  const res = s.results[id];
  const cands = res?.candidates ?? [];
  const called = s.calls[id];
  const leader = cands[0];
  const winParty = called?.party;
  return {
    meta,
    cands,
    pctReporting: res?.pctReporting ?? 0,
    totalVotes: res?.totalVotes ?? 0,
    called,
    leader,
    flip: !!(winParty && meta.priorParty && winParty !== meta.priorParty && winParty !== 'N'),
    hasVotes: (res?.totalVotes ?? 0) > 0,
  };
}

export function boardRaces(s: PublicState, set: BoardSet): RaceMeta[] {
  const order = (a: RaceMeta, b: RaceMeta) => catRank(a) - catRank(b) || (a.order ?? 0) - (b.order ?? 0) || a.title.localeCompare(b.title);
  let list: RaceMeta[];
  switch (set) {
    case 'key': list = s.races.filter((r) => r.key); break;
    case 'ok': list = s.races.filter((r) => r.oklahoma); break;
    case 'watch': list = s.races.filter((r) => s.stars.includes(r.id)); break;
    case 'senate': list = s.races.filter((r) => r.category === 'senate'); break;
    case 'governor': list = s.races.filter((r) => r.category === 'governor'); break;
  }
  return list.sort(order);
}

function catRank(r: RaceMeta) {
  const office = r.office;
  if (r.category === 'senate') return 0;
  if (r.category === 'governor') return 1;
  if (office === 'Lieutenant Governor') return 2;
  if (r.category === 'ok' && office !== 'State Question' && office !== 'Judicial Retention') return 3;
  if (r.category === 'house') return 4;
  if (office === 'State Question') return 5;
  if (office === 'Judicial Retention') return 6;
  return 7;
}

export const BOARD_LABEL: Record<BoardSet, string> = {
  key: 'Key Races', ok: 'Oklahoma', watch: 'Watch List', senate: 'U.S. Senate', governor: 'Governor',
};

/** Leader colour for maps: full colour when called, tint when leading. */
export function leaningParty(v: RaceView | undefined): { party: Party; called: boolean; name?: string } | undefined {
  if (!v) return undefined;
  if (v.called) return { party: v.called.party, called: true, name: v.called.name };
  if (v.leader && v.hasVotes) return { party: v.leader.party, called: false, name: v.leader.name };
  return undefined;
}

export function lastName(name: string) {
  const parts = name.replace(/\s+(Jr\.?|Sr\.?|II|III|IV)$/i, '').replace(/"[^"]*"/g, '').trim().split(/\s+/);
  return parts[parts.length - 1] ?? name;
}
