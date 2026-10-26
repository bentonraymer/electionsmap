// Types shared by the server and the web app.

export type Party = 'D' | 'R' | 'I' | 'L' | 'G' | 'O' | 'N';
export type Category = 'senate' | 'house' | 'governor' | 'ok' | 'other';
export type Chamber = 'senate' | 'house' | 'governor';

/** Static info about a race we track (from the seed catalog or a star). */
export interface RaceMeta {
  id: number;
  title: string; // "Georgia US Senate"
  short: string; // "GA SEN"
  office: string; // "U.S. Senate"
  category: Category;
  state: string; // 2-letter, lower case ("ok")
  district?: string; // "ok-01" for House
  priorParty?: Party; // party holding the seat before the election
  key?: boolean; // featured in the national key-race list
  oklahoma?: boolean; // featured in the Oklahoma list
  order?: number;
}

export interface Candidate {
  id: string;
  name: string;
  party: Party;
  partyName: string;
  votes: number;
  pct: number;
  incumbent?: boolean;
  feedWinner?: boolean; // winner flag from the data feed (suggestion only)
}

export interface RegionResult {
  name: string;
  fips?: string;
  pctReporting: number;
  candidates: { name: string; party: Party; votes: number; pct: number }[];
}

/** Results as shown on air: feed data merged with manual overrides. */
export interface RaceResult {
  id: number;
  pctReporting: number;
  candidates: Candidate[]; // sorted by votes desc
  totalVotes: number;
  lastUpdated?: string;
  pollsClose?: string;
  overridden?: boolean;
  regions?: Record<string, RegionResult>; // only for races on air
}

export interface Call {
  candidateId: string;
  name: string;
  party: Party;
  at: string;
}

export type AlertKind = 'call' | 'flip' | 'control' | 'breaking';
export interface Alert {
  id: string;
  kind: AlertKind;
  title: string; // "RACE CALL" / "SEAT FLIP" / "BREAKING"
  text: string; // headline
  sub?: string;
  party?: Party;
  raceId?: number;
  status: 'pending' | 'aired' | 'dismissed';
  createdAt: string;
}

export type TvView = 'national' | 'race' | 'board' | 'bop';
export type BoardSet = 'key' | 'ok' | 'watch' | 'senate' | 'governor';

export interface ShowState {
  tv: {
    view: TvView;
    raceId?: number;
    chamber: Chamber; // for national map + bop views
    board: BoardSet;
  };
  gfx: {
    lowerThird: { on: boolean; raceId?: number };
    ticker: { on: boolean; set: BoardSet };
    bop: { on: boolean; chamber: 'senate' | 'house' };
  };
  banner: { alertId: string; until: number } | null; // alert currently on air
}

export interface Settings {
  autoAirAlerts: boolean;
  frozen: boolean;
  bannerSeconds: number;
}

export interface FeedHealth {
  source: 'civicapi' | 'simulation';
  lastSuccess?: string;
  lastError?: string;
  errorCount: number;
}

export interface BalanceOfPower {
  chamber: 'senate' | 'house';
  total: number;
  majority: number;
  holdover: Record<'D' | 'R' | 'I', number>;
  won: Record<'D' | 'R' | 'I', number>;
  leading: Record<'D' | 'R' | 'I', number>;
  uncalled: number;
}

export interface PublicState {
  races: RaceMeta[];
  results: Record<number, RaceResult>;
  calls: Record<number, Call>;
  stars: number[];
  show: ShowState;
  alerts: Alert[];
  settings: Settings;
  health: FeedHealth;
  bop: { senate: BalanceOfPower; house: BalanceOfPower };
  serverTime: number;
}

export type Action =
  | { type: 'tv'; view?: TvView; raceId?: number; chamber?: Chamber; board?: BoardSet }
  | { type: 'lowerThird'; on: boolean; raceId?: number }
  | { type: 'ticker'; on: boolean; set?: BoardSet }
  | { type: 'bopBug'; on: boolean; chamber?: 'senate' | 'house' }
  | { type: 'clearGfx' }
  | { type: 'call'; raceId: number; candidateId: string }
  | { type: 'uncall'; raceId: number }
  | { type: 'star'; raceId: number; on: boolean; meta?: Partial<RaceMeta> }
  | { type: 'override'; raceId: number; pctReporting?: number | null; votes?: Record<string, number | null> }
  | { type: 'clearOverride'; raceId: number }
  | { type: 'breaking'; text: string; sub?: string; air?: boolean }
  | { type: 'airAlert'; id: string }
  | { type: 'dismissAlert'; id: string }
  | { type: 'clearBanner' }
  | { type: 'settings'; patch: Partial<Settings> }
  | { type: 'resetNight' };

export const PARTY_LABEL: Record<Party, string> = {
  D: 'DEM', R: 'REP', I: 'IND', L: 'LIB', G: 'GRN', O: 'OTH', N: 'NP',
};
