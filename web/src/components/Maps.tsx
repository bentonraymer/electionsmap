import { geoAlbers, geoAlbersUsa, geoMercator, geoPath, type GeoProjection } from 'd3-geo';
import type { FeatureCollection, Geometry } from 'geojson';
import { useEffect, useMemo, useState } from 'react';
import type { Chamber, Party, PublicState, RegionResult } from '../../../shared/types';
import { leaningParty, raceView, type RaceView } from '../derive';
import { FIPS_STATE, loadCounties, STATE_FIPS, stateBorders, stateFeature, statesGeo } from '../geo';
import { candidateColor, candidateTint, partyColor, partyTint } from '../theme';

const NO_RACE = 'rgba(255,255,255,0.07)';
const NO_VOTES = 'rgba(255,255,255,0.26)';
const SMALL = new Set(['ri', 'de', 'ct', 'nj', 'md', 'ma', 'nh', 'vt', 'dc']);

function mix(a: string, b: string, t: number) {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('');
}

/** National map: each state coloured by its race in the chosen chamber. */
export function UsMap({ s, chamber, width, height }: { s: PublicState; chamber: Chamber; width: number; height: number }) {
  const path = useMemo(() => geoPath(geoAlbersUsa().fitSize([width, height], statesGeo)), [width, height]);
  const byState = useMemo(() => {
    const m = new Map<string, RaceView>();
    for (const r of s.races) {
      if (r.category !== chamber) continue;
      const v = raceView(s, r.id);
      if (v && !m.has(r.state)) m.set(r.state, v);
    }
    return m;
  }, [s, chamber]);

  return (
    <div className="map">
      <svg width={width} height={height}>
        {statesGeo.features.map((f) => {
          const st = FIPS_STATE[String(f.id)];
          const v = byState.get(st);
          const lean = leaningParty(v);
          const fill = !v ? NO_RACE : !lean ? NO_VOTES : lean.called ? partyColor[lean.party] : partyTint[lean.party];
          return <path key={String(f.id)} className="state" d={path(f) ?? ''} fill={fill} />;
        })}
        <path className="outline" d={path(stateBorders) ?? ''} style={{ strokeWidth: 0.8, stroke: 'rgba(255,255,255,0.6)' }} />
        {statesGeo.features.map((f) => {
          const st = FIPS_STATE[String(f.id)];
          if (!byState.has(st) || SMALL.has(st)) return null;
          const [x, y] = path.centroid(f);
          if (!isFinite(x)) return null;
          const v = byState.get(st)!;
          return (
            <text key={'l' + f.id} className="st" x={x} y={y + 5}>
              {st.toUpperCase()}{v.called ? ' ✓' : ''}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

function stateProjection(state: string): GeoProjection {
  if (state === 'ak') return geoAlbers().rotate([154, 0]).center([-2, 58.5]).parallels([55, 65]);
  return geoMercator();
}

/** County results for one race; falls back to a state silhouette when the feed has no county FIPS. */
export function StateMap({ view, regions, width, height }: { view: RaceView; regions?: Record<string, RegionResult>; width: number; height: number }) {
  const state = view.meta.state;
  const [counties, setCounties] = useState<FeatureCollection<Geometry, { name: string }> | null>(null);
  useEffect(() => { loadCounties().then(setCounties); }, []);

  const outline = stateFeature(state);
  const proj = useMemo(() => (outline ? stateProjection(state).fitExtent([[10, 10], [width - 10, height - 10]], outline) : null), [state, width, height, outline]);
  if (!outline || !proj) return null;
  const path = geoPath(proj);

  const byFips = new Map<string, RegionResult>();
  for (const r of Object.values(regions ?? {})) if (r.fips) byFips.set(r.fips.padStart(5, '0'), r);
  const prefix = STATE_FIPS[state];
  const stateCounties = counties?.features.filter((f) => String(f.id).startsWith(prefix)) ?? [];
  const matched = stateCounties.filter((f) => byFips.has(String(f.id))).length;
  const useCounties = stateCounties.length > 0 && matched / stateCounties.length > 0.5;

  const regionFill = (r: RegionResult | undefined) => {
    if (!r) return NO_VOTES;
    const c = [...r.candidates].sort((a, b) => b.votes - a.votes);
    if (!c[0] || c[0].votes === 0) return NO_VOTES;
    const margin = c[0].pct - (c[1]?.pct ?? 0);
    const t = Math.min(1, margin / 25);
    return mix(candidateTint(c[0].name, c[0].party), candidateColor(c[0].name, c[0].party), t);
  };

  const lean = leaningParty(view);
  const leaderName = view.leader?.name ?? '';
  const stateFill = !lean ? NO_VOTES : lean.called ? candidateColor(leaderName, lean.party) : candidateTint(leaderName, lean.party);

  return (
    <div className="map">
      <svg width={width} height={height}>
        {useCounties
          ? stateCounties.map((f) => <path key={String(f.id)} className="county" d={path(f) ?? ''} fill={regionFill(byFips.get(String(f.id)))} />)
          : <path className="state" d={path(outline) ?? ''} fill={stateFill} />}
        <path className="outline" d={path(outline) ?? ''} />
      </svg>
    </div>
  );
}

export function MapLegend({ parties }: { parties: Party[] }) {
  const label: Partial<Record<Party, string>> = { D: 'Democrat', R: 'Republican', I: 'Independent' };
  return (
    <div className="map-legend">
      {parties.map((p) => (
        <span key={p}><i style={{ background: partyColor[p] }} />{label[p]} won</span>
      ))}
      {parties.map((p) => (
        <span key={p + 'l'}><i style={{ background: partyTint[p] }} />{label[p]} leading</span>
      ))}
      <span><i style={{ background: NO_VOTES }} />No results yet</span>
    </div>
  );
}
