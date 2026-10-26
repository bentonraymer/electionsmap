// Builds server/seed/races.json from civicAPI.
// Run before election night (npm run seed) and commit the result.
import { writeFileSync } from 'node:fs';
import type { Party, RaceMeta } from '../shared/types.ts';
import { partyCode } from '../shared/party.ts';

const BASE = process.env.CIVICAPI_BASE ?? 'https://civicapi.org/api/v2';
const DATE = '2026-11-03';
const SENATE_AGG = 87528;
const HOUSE_AGG = 87524;

const STATES: Record<string, string> = {
  al: 'Alabama', ak: 'Alaska', az: 'Arizona', ar: 'Arkansas', ca: 'California', co: 'Colorado',
  ct: 'Connecticut', de: 'Delaware', fl: 'Florida', ga: 'Georgia', hi: 'Hawaii', id: 'Idaho',
  il: 'Illinois', in: 'Indiana', ia: 'Iowa', ks: 'Kansas', ky: 'Kentucky', la: 'Louisiana',
  me: 'Maine', md: 'Maryland', ma: 'Massachusetts', mi: 'Michigan', mn: 'Minnesota',
  ms: 'Mississippi', mo: 'Missouri', mt: 'Montana', ne: 'Nebraska', nv: 'Nevada',
  nh: 'New Hampshire', nj: 'New Jersey', nm: 'New Mexico', ny: 'New York', nc: 'North Carolina',
  nd: 'North Dakota', oh: 'Ohio', ok: 'Oklahoma', or: 'Oregon', pa: 'Pennsylvania',
  ri: 'Rhode Island', sc: 'South Carolina', sd: 'South Dakota', tn: 'Tennessee', tx: 'Texas',
  ut: 'Utah', vt: 'Vermont', va: 'Virginia', wa: 'Washington', wv: 'West Virginia',
  wi: 'Wisconsin', wy: 'Wyoming',
};

// Party holding each seat going into Nov 3, 2026.
const SENATE_PRIOR_D = ['co', 'de', 'ga', 'il', 'ma', 'mi', 'mn', 'nh', 'nj', 'nm', 'or', 'ri', 'va'];
const SENATE_KEY = ['ga', 'mi', 'nc', 'me', 'nh', 'oh', 'tx', 'ia', 'ak', 'ne', 'mn', 'ok'];

const GOVERNOR_PRIOR: Record<string, Party> = {
  al: 'R', ak: 'R', az: 'D', ar: 'R', ca: 'D', co: 'D', ct: 'D', fl: 'R', ga: 'R', hi: 'D',
  id: 'R', il: 'D', ia: 'R', ks: 'D', me: 'D', md: 'D', ma: 'D', mi: 'D', mn: 'D', ne: 'R',
  nv: 'R', nh: 'R', nm: 'D', ny: 'D', oh: 'R', ok: 'R', or: 'D', pa: 'D', ri: 'D', sc: 'R',
  sd: 'R', tn: 'R', tx: 'R', vt: 'R', wi: 'D', wy: 'R',
};
const GOVERNOR_KEY = ['az', 'ga', 'mi', 'wi', 'nv', 'pa', 'ks', 'ia', 'oh', 'ny', 'me', 'nh', 'mn', 'ok'];

// Battleground House districts (producers can star more from /control).
// Value is the party holding the seat going in (the feed rarely flags incumbents).
const HOUSE_KEY: Record<string, Party> = {
  'az-01': 'R', 'az-06': 'R', 'ca-13': 'D', 'ca-22': 'R', 'ca-45': 'D', 'co-08': 'R', 'ia-01': 'R',
  'ia-03': 'R', 'me-02': 'D', 'mi-07': 'R', 'mi-08': 'D', 'mi-10': 'R', 'ne-02': 'R', 'nj-07': 'R',
  'ny-01': 'R', 'ny-17': 'R', 'pa-01': 'R', 'pa-07': 'R', 'pa-08': 'R', 'pa-10': 'R', 'va-01': 'R',
  'va-02': 'R', 'wi-03': 'R', 'nc-01': 'D', 'oh-09': 'D', 'oh-13': 'D', 'tx-28': 'D', 'tx-34': 'D',
  'nm-02': 'D', 'wa-03': 'D',
};

const OK_STATEWIDE_TYPES = new Set([
  'Governor', 'Lieutenant Governor', 'Attorney General', 'State Treasurer', 'State Auditor',
  'Superintendent', 'Labor Commissioner', 'Insurance Commissioner', 'Corporation Commissioner',
]);

async function get(path: string) {
  const res = await fetch(BASE + path);
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return res.json() as Promise<any>;
}

async function main() {
  const races: RaceMeta[] = [];
  const add = (r: RaceMeta) => { if (!races.some((x) => x.id === r.id)) races.push(r); };

  // US Senate: every race comes from the national aggregate.
  const senate = await get(`/race/${SENATE_AGG}`);
  for (const [st, region] of Object.entries<any>(senate.region_results)) {
    const special = /special/i.test(region.name) ? ' (Special)' : '';
    add({
      id: region.election_id, title: `${STATES[st]} US Senate${special}`, short: `${st.toUpperCase()} SEN`,
      office: 'U.S. Senate', category: 'senate', state: st,
      priorParty: SENATE_PRIOR_D.includes(st) ? 'D' : 'R',
      key: SENATE_KEY.includes(st), oklahoma: st === 'ok' || undefined,
    });
  }

  // US House: every district from the national aggregate; flag battlegrounds.
  const house = await get(`/race/${HOUSE_AGG}`);
  for (const [key, region] of Object.entries<any>(house.region_results)) {
    const st = key.split('-')[0];
    const inc = region.candidates.find((c: any) => c.incumbent);
    const dist = key.split('-')[1] === 'al' ? 'AL' : String(Number(key.split('-')[1]));
    add({
      id: region.election_id, title: `${STATES[st] ?? st.toUpperCase()} ${dist === 'AL' ? 'At-Large' : 'District ' + dist}`,
      short: `${st.toUpperCase()}-${dist}`, office: 'U.S. House', category: 'house', state: st, district: key,
      priorParty: HOUSE_KEY[key] ?? (inc ? partyCode(inc.party) : st === 'ok' ? 'R' : undefined),
      key: key in HOUSE_KEY || undefined, oklahoma: st === 'ok' || undefined,
    });
  }

  // Governors: search each state.
  for (const [st, prior] of Object.entries(GOVERNOR_PRIOR)) {
    const d = await get(`/race/search?query=${encodeURIComponent(STATES[st] + ' Governor')}&limit=50`);
    const r = d.races.find((x: any) => x.type === 'Governor' && x.election_date.startsWith(DATE) && x.province?.toLowerCase() === st);
    if (!r) { console.warn(`no governor race found for ${st}`); continue; }
    add({
      id: r.id, title: `${STATES[st]} Governor`, short: `${st.toUpperCase()} GOV`, office: 'Governor',
      category: 'governor', order: st === 'ok' ? -1 : undefined, state: st, priorParty: prior,
      key: GOVERNOR_KEY.includes(st), oklahoma: st === 'ok' || undefined,
    });
  }

  // Oklahoma statewide offices, state questions and appellate retentions.
  const okRaces: any[] = [];
  for (let offset = 0; ; offset += 100) {
    const d = await get(`/race/search?query=Oklahoma&limit=100&offset=${offset}`);
    okRaces.push(...d.races);
    if (d.races.length < 100) break;
  }
  let order = 0;
  for (const r of okRaces) {
    if (!r.election_date.startsWith(DATE) || r.province !== 'OK') continue;
    const name: string = r.election_name;
    if (OK_STATEWIDE_TYPES.has(r.type)) {
      add({ id: r.id, title: name, short: name.replace('Oklahoma ', ''), office: name.replace('Oklahoma ', ''),
        category: 'ok', state: 'ok', priorParty: 'R', oklahoma: true, order: order++ });
    } else if (r.type === 'Referendum' && /State Question/.test(name)) {
      add({ id: r.id, title: name, short: name.replace('Oklahoma State Question', 'SQ'), office: 'State Question',
        category: 'ok', state: 'ok', oklahoma: true, order: 100 + order++ });
    } else if (r.type === 'Judicial' && /(Supreme Court|Court of Civil Appeals|Court of Criminal Appeals).*Retention/.test(name)) {
      add({ id: r.id, title: name, short: name.replace('Oklahoma ', ''), office: 'Judicial Retention',
        category: 'ok', state: 'ok', oklahoma: true, order: 200 + order++ });
    }
  }

  races.sort((a, b) => a.category.localeCompare(b.category) || (a.order ?? 0) - (b.order ?? 0) || a.title.localeCompare(b.title));
  const out = { generatedAt: new Date().toISOString(), senateAggregate: SENATE_AGG, houseAggregate: HOUSE_AGG, races };
  writeFileSync(new URL('../server/seed/races.json', import.meta.url), JSON.stringify(out, null, 1) + '\n');
  const counts = races.reduce<Record<string, number>>((m, r) => ((m[r.category] = (m[r.category] ?? 0) + 1), m), {});
  console.log('wrote', races.length, 'races', counts, 'key:', races.filter((r) => r.key).length);
}

main().catch((e) => { console.error(e); process.exit(1); });
