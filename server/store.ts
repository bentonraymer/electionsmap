// Central state: race catalog, feed data, overrides, calls, alerts and show state.
// Everything the displays render is derived here and broadcast as a PublicState snapshot.
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type {
  Action, Alert, BalanceOfPower, Call, Candidate, FeedHealth, Party, PublicState, RaceMeta,
  RaceResult, Settings, ShowState,
} from '../shared/types.js';
import { PARTY_LABEL } from '../shared/types.js';
import type { FeedRace } from './civic.js';
import { load, save } from './db.js';

interface Seed { senateAggregate: number; houseAggregate: number; races: RaceMeta[] }
export const seed: Seed = JSON.parse(readFileSync(new URL('./seed/races.json', import.meta.url), 'utf8'));

// Senate seats not up in 2026 (Democrats include the two independents who caucus with them).
const SENATE_HOLDOVER = { D: 34, R: 31, I: 0 };
// Vice President is a Republican, so Republicans control the Senate at 50.
const SENATE_CONTROL = { D: 51, R: 50 };
const HOUSE_CONTROL = 218;

interface Override { pctReporting?: number; votes?: Record<string, number> }

const DEFAULT_SHOW: ShowState = {
  tv: { view: 'national', chamber: 'senate', board: 'key' },
  gfx: { lowerThird: { on: false }, ticker: { on: false, set: 'key' }, bop: { on: false, chamber: 'senate' } },
  banner: null,
};
const DEFAULT_SETTINGS: Settings = { autoAirAlerts: false, frozen: false, bannerSeconds: 12 };

type Listener = () => void;

class Store {
  races = new Map<number, RaceMeta>(seed.races.map((r) => [r.id, r]));
  feed = new Map<number, FeedRace>(load<[number, FeedRace][]>('feed', []));
  live = new Map<number, FeedRace>(this.feed); // what is published (differs from feed while frozen)
  overrides = new Map<number, Override>(load<[number, Override][]>('overrides', []));
  calls = new Map<number, Call>(load<[number, Call][]>('calls', []));
  starred = new Map<number, RaceMeta>(load<[number, RaceMeta][]>('starred', []));
  alerts: Alert[] = load('alerts', []);
  show: ShowState = { ...DEFAULT_SHOW, ...load<Partial<ShowState>>('show', {}) };
  settings: Settings = { ...DEFAULT_SETTINGS, ...load<Partial<Settings>>('settings', {}) };
  controlFlags: Record<string, boolean> = load('controlFlags', {});
  health: FeedHealth = { source: 'civicapi', errorCount: 0 };

  private listeners = new Set<Listener>();
  private bannerTimer?: NodeJS.Timeout;
  private feedDirty = false;

  constructor() {
    for (const [id, meta] of this.starred) if (!this.races.has(id)) this.races.set(id, meta);
    setInterval(() => this.flushFeed(), 10_000).unref();
    this.scheduleBannerClear();
  }

  onChange(fn: Listener) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  private emit() { for (const fn of this.listeners) fn(); }

  // ---- feed ingestion -------------------------------------------------------

  /** Merge race data from the feed (or simulation). Regions are kept if the update has none. */
  ingest(updates: FeedRace[]) {
    for (const u of updates) {
      if (!this.races.has(u.id)) continue;
      const prev = this.feed.get(u.id);
      this.feed.set(u.id, { ...u, regions: u.regions ?? prev?.regions, pollsClose: u.pollsClose ?? prev?.pollsClose });
    }
    this.feedDirty = true;
    if (!this.settings.frozen) this.live = new Map(this.feed);
    this.checkControl();
    this.emit();
  }

  private flushFeed() {
    if (!this.feedDirty) return;
    this.feedDirty = false;
    save('feed', [...this.feed]);
  }

  setHealth(patch: Partial<FeedHealth>) {
    this.health = { ...this.health, ...patch };
    this.emit();
  }

  /** Races whose per-race detail should be polled (anything not covered by the aggregates). */
  detailRaceIds(): number[] {
    const ids = new Set<number>();
    for (const r of this.races.values()) {
      if (r.category === 'governor' || r.category === 'ok' || r.category === 'other') ids.add(r.id);
    }
    for (const id of this.starred.keys()) ids.add(id);
    return [...ids];
  }

  onAirRaceIds(): number[] {
    const ids = new Set<number>();
    if (this.show.tv.view === 'race' && this.show.tv.raceId) ids.add(this.show.tv.raceId);
    if (this.show.gfx.lowerThird.on && this.show.gfx.lowerThird.raceId) ids.add(this.show.gfx.lowerThird.raceId);
    return [...ids];
  }

  // ---- derived results ------------------------------------------------------

  result(id: number, withRegions = false): RaceResult | undefined {
    const f = this.live.get(id);
    if (!f) return undefined;
    const o = this.overrides.get(id);
    let cands: Candidate[] = f.candidates.map((c) => ({ ...c }));
    if (o?.votes) for (const c of cands) if (o.votes[c.id] != null) c.votes = o.votes[c.id];
    const total = cands.reduce((s, c) => s + c.votes, 0);
    if (o?.votes || total > 0) for (const c of cands) c.pct = total ? (c.votes / total) * 100 : 0;
    cands = cands.sort((a, b) => b.votes - a.votes);
    return {
      id,
      pctReporting: o?.pctReporting ?? f.pctReporting,
      candidates: cands,
      totalVotes: total,
      lastUpdated: f.lastUpdated,
      pollsClose: f.pollsClose,
      overridden: !!o || undefined,
      regions: withRegions ? f.regions : undefined,
    };
  }

  private bucket(p: Party): 'D' | 'R' | 'I' { return p === 'D' ? 'D' : p === 'R' ? 'R' : 'I'; }

  bop(chamber: 'senate' | 'house'): BalanceOfPower {
    const holdover = chamber === 'senate' ? { ...SENATE_HOLDOVER } : { D: 0, R: 0, I: 0 };
    const won = { D: 0, R: 0, I: 0 };
    const leading = { D: 0, R: 0, I: 0 };
    let uncalled = 0;
    for (const r of this.races.values()) {
      if (r.category !== chamber) continue;
      const call = this.calls.get(r.id);
      if (call) { won[this.bucket(call.party)]++; continue; }
      const res = this.result(r.id);
      // House: 435 races are too many to call by hand, so feed winners count toward the tally.
      const feedWin = chamber === 'house' ? res?.candidates.find((c) => c.feedWinner) : undefined;
      if (feedWin) { won[this.bucket(feedWin.party)]++; continue; }
      uncalled++;
      const lead = res?.candidates[0];
      if (lead && lead.votes > 0) leading[this.bucket(lead.party)]++;
    }
    const total = chamber === 'senate' ? 100 : 435;
    return { chamber, total, majority: chamber === 'senate' ? 51 : HOUSE_CONTROL, holdover, won, leading, uncalled };
  }

  private checkControl() {
    const s = this.bop('senate');
    const h = this.bop('house');
    const checks: [string, boolean, string, Party][] = [
      ['senate-D', s.holdover.D + s.won.D >= SENATE_CONTROL.D, 'DEMOCRATS WIN CONTROL OF THE SENATE', 'D'],
      ['senate-R', s.holdover.R + s.won.R >= SENATE_CONTROL.R, 'REPUBLICANS KEEP CONTROL OF THE SENATE', 'R'],
      ['house-D', h.won.D >= HOUSE_CONTROL, 'DEMOCRATS WIN CONTROL OF THE HOUSE', 'D'],
      ['house-R', h.won.R >= HOUSE_CONTROL, 'REPUBLICANS KEEP CONTROL OF THE HOUSE', 'R'],
    ];
    for (const [key, hit, text, party] of checks) {
      if (hit && !this.controlFlags[key]) {
        this.controlFlags[key] = true;
        save('controlFlags', this.controlFlags);
        this.addAlert({ kind: 'control', title: 'PROJECTION', text, party, sub: key.startsWith('senate') ? 'U.S. Senate' : 'U.S. House' });
      } else if (!hit && this.controlFlags[key]) {
        this.controlFlags[key] = false; // un-called race dropped below the line
        save('controlFlags', this.controlFlags);
      }
    }
  }

  // ---- alerts ---------------------------------------------------------------

  private addAlert(a: Omit<Alert, 'id' | 'status' | 'createdAt'>, air = this.settings.autoAirAlerts) {
    const alert: Alert = { ...a, id: randomUUID(), status: 'pending', createdAt: new Date().toISOString() };
    this.alerts = [alert, ...this.alerts].slice(0, 200);
    if (air) this.airAlert(alert.id);
    save('alerts', this.alerts);
  }

  private airAlert(id: string) {
    const a = this.alerts.find((x) => x.id === id);
    if (!a) return;
    a.status = 'aired';
    this.show.banner = { alertId: id, until: Date.now() + this.settings.bannerSeconds * 1000 };
    save('alerts', this.alerts);
    this.scheduleBannerClear();
  }

  private scheduleBannerClear() {
    clearTimeout(this.bannerTimer);
    const b = this.show.banner;
    if (!b) return;
    this.bannerTimer = setTimeout(() => {
      if (this.show.banner?.alertId === b.alertId) {
        this.show.banner = null;
        save('show', this.show);
        this.emit();
      }
    }, Math.max(0, b.until - Date.now()));
  }

  // ---- actions from /control -----------------------------------------------

  apply(a: Action) {
    const show = this.show;
    switch (a.type) {
      case 'tv':
        show.tv = {
          ...show.tv,
          ...(a.view && { view: a.view }), ...(a.raceId && { raceId: a.raceId }),
          ...(a.chamber && { chamber: a.chamber }), ...(a.board && { board: a.board }),
        };
        break;
      case 'lowerThird':
        show.gfx.lowerThird = { on: a.on, raceId: a.raceId ?? show.gfx.lowerThird.raceId };
        break;
      case 'ticker':
        show.gfx.ticker = { on: a.on, set: a.set ?? show.gfx.ticker.set };
        break;
      case 'bopBug':
        show.gfx.bop = { on: a.on, chamber: a.chamber ?? show.gfx.bop.chamber };
        break;
      case 'clearGfx':
        show.gfx.lowerThird.on = false;
        show.gfx.ticker.on = false;
        show.gfx.bop.on = false;
        show.banner = null;
        break;
      case 'call': {
        const meta = this.races.get(a.raceId);
        const cand = this.result(a.raceId)?.candidates.find((c) => c.id === a.candidateId);
        if (!meta || !cand) throw new Error('unknown race or candidate');
        this.calls.set(a.raceId, { candidateId: cand.id, name: cand.name, party: cand.party, at: new Date().toISOString() });
        save('calls', [...this.calls]);
        const flip = meta.priorParty && cand.party !== meta.priorParty && cand.party !== 'N';
        const who = cand.party === 'N' ? cand.name : `${cand.name} (${PARTY_LABEL[cand.party]})`;
        if (flip) {
          this.addAlert({ kind: 'flip', title: `${PARTY_LABEL[cand.party]} PICKUP`, text: `${who} wins`, sub: `${meta.title} · Flipped from ${PARTY_LABEL[meta.priorParty!]}`, party: cand.party, raceId: a.raceId });
        } else {
          this.addAlert({ kind: 'call', title: 'RACE CALL', text: meta.office === 'State Question' || meta.office === 'Judicial Retention' ? `${meta.short}: ${cand.name.toUpperCase()}` : `${who} wins`, sub: meta.title, party: cand.party, raceId: a.raceId });
        }
        this.checkControl();
        break;
      }
      case 'uncall':
        this.calls.delete(a.raceId);
        save('calls', [...this.calls]);
        this.checkControl();
        break;
      case 'star':
        if (a.on) {
          const meta: RaceMeta = this.races.get(a.raceId) ?? {
            id: a.raceId, title: a.meta?.title ?? `Race ${a.raceId}`, short: a.meta?.short ?? a.meta?.title ?? `#${a.raceId}`,
            office: a.meta?.office ?? '', category: 'other', state: a.meta?.state ?? '',
          };
          this.races.set(a.raceId, meta);
          this.starred.set(a.raceId, meta);
        } else {
          this.starred.delete(a.raceId);
          if (this.races.get(a.raceId)?.category === 'other') this.races.delete(a.raceId);
        }
        save('starred', [...this.starred]);
        break;
      case 'override': {
        const o: Override = { ...this.overrides.get(a.raceId) };
        if (a.pctReporting !== undefined) {
          if (a.pctReporting === null) delete o.pctReporting; else o.pctReporting = a.pctReporting;
        }
        if (a.votes) {
          o.votes = { ...o.votes };
          for (const [k, v] of Object.entries(a.votes)) if (v === null) delete o.votes[k]; else o.votes[k] = v;
          if (!Object.keys(o.votes).length) delete o.votes;
        }
        if (o.pctReporting === undefined && !o.votes) this.overrides.delete(a.raceId); else this.overrides.set(a.raceId, o);
        save('overrides', [...this.overrides]);
        break;
      }
      case 'clearOverride':
        this.overrides.delete(a.raceId);
        save('overrides', [...this.overrides]);
        break;
      case 'breaking':
        this.addAlert({ kind: 'breaking', title: 'BREAKING', text: a.text, sub: a.sub }, a.air ?? true);
        break;
      case 'airAlert':
        this.airAlert(a.id);
        break;
      case 'dismissAlert': {
        const al = this.alerts.find((x) => x.id === a.id);
        if (al) al.status = 'dismissed';
        if (show.banner?.alertId === a.id) show.banner = null;
        save('alerts', this.alerts);
        break;
      }
      case 'clearBanner':
        show.banner = null;
        break;
      case 'resetNight': // wipe calls, overrides and alerts (e.g. after a rehearsal)
        this.calls.clear();
        this.overrides.clear();
        this.alerts = [];
        this.controlFlags = {};
        show.banner = null;
        save('calls', []); save('overrides', []); save('alerts', []); save('controlFlags', {});
        break;
      case 'settings':
        this.settings = { ...this.settings, ...a.patch };
        if (!this.settings.frozen) this.live = new Map(this.feed);
        save('settings', this.settings);
        break;
    }
    save('show', show);
    this.emit();
  }

  // ---- snapshot -------------------------------------------------------------

  snapshot(): PublicState {
    const onAir = new Set(this.onAirRaceIds());
    if (this.show.tv.raceId) onAir.add(this.show.tv.raceId);
    const results: Record<number, RaceResult> = {};
    for (const id of this.races.keys()) {
      const r = this.result(id, onAir.has(id));
      if (r) results[id] = r;
    }
    return {
      races: [...this.races.values()],
      results,
      calls: Object.fromEntries(this.calls),
      stars: [...this.starred.keys()],
      show: this.show,
      alerts: this.alerts.slice(0, 50),
      settings: this.settings,
      health: this.health,
      bop: { senate: this.bop('senate'), house: this.bop('house') },
      serverTime: Date.now(),
    };
  }
}

export const store = new Store();
