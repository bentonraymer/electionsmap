// Rehearsal mode: takes the real race structure from civicAPI and fakes an election night on top.
import type { Candidate, Party, RaceMeta, RegionResult } from '../shared/types.js';
import type { FeedRace } from './civic.js';
import { config } from './config.js';
import { store } from './store.js';

interface SimRace {
  base: FeedRace;
  start: number; // seconds into the night when results start
  duration: number; // seconds to reach 100%
  shares: Map<string, number>;
  size: number; // expected total votes
  regionJitter: Map<string, { offset: number; tilt: number; size: number }>;
}

const sims = new Map<number, SimRace>();
const t0 = Date.now();
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;

function makeShares(meta: RaceMeta | undefined, cands: Candidate[]): Map<string, number> {
  const shares = new Map<string, number>();
  if (cands.length === 1) return shares.set(cands[0].id, 1);
  const yes = cands.find((c) => /^yes$/i.test(c.name));
  if (yes) {
    const y = rand(0.42, 0.68);
    for (const c of cands) shares.set(c.id, c === yes ? y : 1 - y);
    return shares;
  }
  // Two-party contest with a lean toward the seat's prior party, plus small minor-party shares.
  const d = cands.find((c) => c.party === 'D');
  const r = cands.find((c) => c.party === 'R');
  let minor = 0;
  for (const c of cands) if (c !== d && c !== r) { const s = rand(0.005, 0.03); shares.set(c.id, s); minor += s; }
  const lean = meta?.priorParty === 'R' ? 0.06 : meta?.priorParty === 'D' ? -0.06 : 0;
  const rShare = (1 - minor) * Math.min(0.8, Math.max(0.2, 0.5 + lean + gauss() * 0.12));
  if (r && d) { shares.set(r.id, rShare); shares.set(d.id, 1 - minor - rShare); }
  else if (r || d) shares.set((r ?? d)!.id, 1 - minor);
  return shares;
}

function sizeFor(meta: RaceMeta | undefined) {
  if (meta?.category === 'house') return rand(220_000, 340_000);
  return rand(800_000, 4_500_000) * (meta?.state === 'ok' ? 0.35 : 1);
}

/** Register (or refresh) the real structure for a race. */
export function simBase(updates: FeedRace[]) {
  for (const u of updates) {
    const meta = store.races.get(u.id);
    const existing = sims.get(u.id);
    if (existing) { if (u.regions && !existing.base.regions) existing.base.regions = u.regions; continue; }
    sims.set(u.id, {
      base: u,
      start: rand(0, 240),
      duration: rand(240, 900),
      shares: makeShares(meta, u.candidates),
      size: sizeFor(meta),
      regionJitter: new Map(),
    });
  }
}

function tick() {
  const t = ((Date.now() - t0) / 1000) * config.simSpeed;
  const out: FeedRace[] = [];
  for (const [id, s] of sims) {
    const prog = Math.min(1, Math.max(0, (t - s.start) / s.duration));
    let regions: Record<string, RegionResult> | undefined;
    const totals = new Map<string, number>();
    let reportingWeighted = 0;
    if (s.base.regions && Object.keys(s.base.regions).length) {
      regions = {};
      let sizeSum = 0;
      for (const [key, reg] of Object.entries(s.base.regions)) {
        let j = s.regionJitter.get(key);
        if (!j) { j = { offset: rand(-0.25, 0.25), tilt: gauss() * 0.15, size: rand(0.2, 3) }; s.regionJitter.set(key, j); }
        sizeSum += j.size;
      }
      for (const [key, reg] of Object.entries(s.base.regions)) {
        const j = s.regionJitter.get(key)!;
        const p = Math.min(1, Math.max(0, prog * 1.25 + j.offset - 0.1));
        const regSize = (s.size * j.size) / sizeSum;
        const cands = s.base.candidates.map((c) => {
          let share = s.shares.get(c.id) ?? 0.01;
          if (c.party === 'R') share *= 1 + j.tilt; else if (c.party === 'D') share *= 1 - j.tilt;
          const votes = Math.round(regSize * p * share);
          totals.set(c.id, (totals.get(c.id) ?? 0) + votes);
          return { name: c.name, party: c.party as Party, votes, pct: 0 };
        });
        const tot = cands.reduce((a, c) => a + c.votes, 0);
        for (const c of cands) c.pct = tot ? (c.votes / tot) * 100 : 0;
        regions[key] = { ...reg, pctReporting: Math.round(p * 100), candidates: cands };
        reportingWeighted += p * j.size;
      }
      reportingWeighted /= sizeSum;
    } else {
      for (const c of s.base.candidates) totals.set(c.id, Math.round(s.size * prog * (s.shares.get(c.id) ?? 0.01) * (1 + gauss() * 0.02 * (1 - prog))));
      reportingWeighted = prog;
    }
    const total = [...totals.values()].reduce((a, b) => a + b, 0);
    const cands = s.base.candidates
      .map((c) => ({ ...c, votes: totals.get(c.id) ?? 0, pct: total ? ((totals.get(c.id) ?? 0) / total) * 100 : 0, feedWinner: undefined as boolean | undefined }))
      .sort((a, b) => b.votes - a.votes);
    const pct = Math.round(reportingWeighted * 100);
    if (cands.length > 1 && pct >= 85 && cands[0].pct - cands[1].pct > 3) cands[0].feedWinner = true;
    if (cands.length === 1 && pct > 0) cands[0].feedWinner = true;
    out.push({ id, pctReporting: pct, candidates: cands, lastUpdated: new Date().toISOString(), pollsClose: s.base.pollsClose, regions });
  }
  if (out.length) store.ingest(out);
}

export function startSim() {
  store.setHealth({ source: 'simulation' });
  setInterval(tick, 2000);
}
