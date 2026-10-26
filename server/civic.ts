// civicAPI adapter: fetches and normalizes race data.
import type { Candidate, RegionResult } from '../shared/types.js';
import { partyCode } from '../shared/party.js';
import { config } from './config.js';

/** Raw feed data for one race, before overrides are applied. */
export interface FeedRace {
  id: number;
  pctReporting: number;
  candidates: Candidate[];
  lastUpdated?: string;
  pollsClose?: string;
  regions?: Record<string, RegionResult>;
}

export interface SearchHit {
  id: number;
  title: string;
  type: string;
  state: string;
  date: string;
  pctReporting: number;
  candidates: { name: string; party: string }[];
}

async function get(path: string): Promise<any> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 15000);
  try {
    const res = await fetch(config.civicBase + path, { signal: ctl.signal, headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`civicAPI ${res.status} for ${path}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

function candidates(list: any[] = []): Candidate[] {
  return list
    .map((c) => ({
      id: String(c.candidate_id ?? c.name),
      name: String(c.name ?? '').replace(/\s+/g, ' ').trim(),
      party: partyCode(c.party),
      partyName: c.party ?? '',
      votes: Number(c.votes) || 0,
      pct: Number(c.percent) || 0,
      incumbent: !!c.incumbent || undefined,
      feedWinner: !!c.winner || undefined,
    }))
    .sort((a, b) => b.votes - a.votes);
}

function regions(rr: Record<string, any> | undefined): Record<string, RegionResult> | undefined {
  if (!rr) return undefined;
  const out: Record<string, RegionResult> = {};
  for (const [key, r] of Object.entries(rr)) {
    out[key] = {
      name: r.name,
      fips: r.fips ?? undefined,
      pctReporting: Number(r.percent_reporting) || 0,
      candidates: (r.candidates ?? []).map((c: any) => ({
        name: c.name, party: partyCode(c.party), votes: Number(c.votes) || 0, pct: Number(c.percent) || 0,
      })),
    };
  }
  return out;
}

export async function fetchRace(id: number): Promise<FeedRace> {
  const d = await get(`/race/${id}`);
  return {
    id,
    pctReporting: Number(d.percent_reporting) || 0,
    candidates: candidates(d.candidates),
    lastUpdated: d.last_updated,
    pollsClose: d.polls_close ?? undefined,
    regions: regions(d.region_results),
  };
}

/** National aggregate races list every Senate race / House district in region_results. */
export async function fetchAggregate(id: number): Promise<FeedRace[]> {
  const d = await get(`/race/${id}`);
  return Object.values<any>(d.region_results ?? {})
    .filter((r) => r.election_id)
    .map((r) => ({
      id: Number(r.election_id),
      pctReporting: Number(r.percent_reporting) || 0,
      candidates: candidates(r.candidates),
      lastUpdated: d.last_updated,
    }));
}

export async function search(query: string): Promise<SearchHit[]> {
  const d = await get(`/race/search?query=${encodeURIComponent(query)}&limit=50`);
  return (d.races ?? []).map((r: any) => ({
    id: r.id,
    title: r.election_name,
    type: r.type,
    state: String(r.province ?? '').toLowerCase(),
    date: String(r.election_date ?? '').slice(0, 10),
    pctReporting: Number(r.percent_reporting) || 0,
    candidates: (r.candidates ?? []).map((c: any) => ({ name: c.name, party: c.party })),
  }));
}
