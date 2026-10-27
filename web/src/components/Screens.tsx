import { useEffect, useState } from 'react';
import type { PublicState } from '../../../shared/types';
import { BOARD_LABEL, raceView } from '../derive';
import { Banner, BopBug, GfxLogo, LowerThird, Ticker } from './Gfx';
import { Logo } from './Logo';
import { MapLegend, StateMap, UsMap } from './Maps';
import { Presence } from './Presence';
import { BigBoard, BopBar, CountyResults, RaceList, ResultsPanel, Reporting } from './Results';

function Clock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  const time = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' });
  return <div className="clock num">{time}</div>;
}

function activeAlert(s: PublicState) {
  return s.show.banner ? s.alerts.find((a) => a.id === s.show.banner!.alertId) : undefined;
}

const CHAMBER_TITLE = { senate: 'U.S. Senate', governor: 'Governor', house: 'U.S. House' };

/** Full-screen in-studio TV output. */
export function TvScreen({ s }: { s: PublicState }) {
  const { tv } = s.show;
  const alert = activeAlert(s);
  const v = raceView(s, tv.raceId);
  const regions = tv.raceId ? s.results[tv.raceId]?.regions : undefined;

  let body: React.ReactNode;
  if (tv.view === 'race' && v) {
    body = (
      <div key={`race-${v.meta.id}`} style={{ position: 'absolute', inset: 0, animation: 'fade-in 0.5s both' }}>
        <div className="tv-section-title"><b>{v.meta.title}</b><small>{v.meta.office}{v.called ? ' · Projected winner' : ' · Unofficial results'}</small></div>
        <div style={{ position: 'absolute', left: 50, top: 170, width: 860, height: 700 }}>
          <StateMap view={v} regions={regions} width={860} height={700} />
        </div>
        <div style={{ position: 'absolute', left: 960, right: 70, top: 190 }}>
          <ResultsPanel v={v} />
          <div style={{ marginTop: 34 }}><Reporting v={v} /></div>
        </div>
      </div>
    );
  } else if (tv.view === 'county' && v) {
    const picked = (tv.counties ?? []).map((k) => regions?.[k]).filter((r): r is NonNullable<typeof r> => !!r);
    body = (
      <div key={`county-${v.meta.id}-${(tv.counties ?? []).join()}`} style={{ position: 'absolute', inset: 0, animation: 'fade-in 0.5s both' }}>
        <div className="tv-section-title"><b>{v.meta.title}</b><small>County results · Unofficial</small></div>
        <div style={{ position: 'absolute', left: 50, top: 170, width: 860, height: 700 }}>
          <StateMap view={v} regions={regions} width={860} height={700} highlight={tv.counties} />
        </div>
        <div style={{ position: 'absolute', left: 960, right: 70, top: 180 }}>
          {picked.length ? <CountyResults v={v} regions={picked} /> : <div className="mini-head">Waiting for county results…</div>}
        </div>
      </div>
    );
  } else if (tv.view === 'board') {
    body = (
      <div key={`board-${tv.board}`} style={{ position: 'absolute', inset: 0 }}>
        <div className="tv-section-title"><b>{BOARD_LABEL[tv.board]}</b></div>
        <BigBoard s={s} set={tv.board} />
      </div>
    );
  } else if (tv.view === 'bop') {
    body = (
      <div key="bop" style={{ position: 'absolute', inset: 0, animation: 'fade-in 0.5s both' }}>
        <div className="tv-section-title"><b>Balance of Power</b><small>Projected seats</small></div>
        <div style={{ position: 'absolute', left: 120, right: 120, top: 220 }}><BopBar b={s.bop.senate} title="U.S. Senate" /></div>
        <div style={{ position: 'absolute', left: 120, right: 120, top: 560 }}><BopBar b={s.bop.house} title="U.S. House" /></div>
      </div>
    );
  } else {
    const chamber = tv.chamber === 'house' ? 'senate' : tv.chamber;
    body = (
      <div key={`nat-${chamber}`} style={{ position: 'absolute', inset: 0, animation: 'fade-in 0.5s both' }}>
        <div className="tv-section-title"><b>{CHAMBER_TITLE[chamber]}</b><small>Races across the country</small></div>
        <div style={{ position: 'absolute', left: 40, top: 150, width: 1240, height: 760 }}>
          <UsMap s={s} chamber={chamber} width={1240} height={760} />
        </div>
        <div style={{ position: 'absolute', left: 90, top: 905 }}><MapLegend parties={['D', 'R']} /></div>
        <div style={{ position: 'absolute', left: 1320, right: 70, top: chamber === 'senate' ? 170 : 190 }}>
          {chamber === 'senate' && <div style={{ marginBottom: 40 }}><BopBar b={s.bop.senate} title="U.S. Senate" compact /></div>}
          <div className="mini-head">Key races</div>
          <RaceList s={s} ids={s.races.filter((r) => r.category === chamber && r.key).sort((a, b) => a.short.localeCompare(b.short)).slice(0, chamber === 'senate' ? 8 : 13).map((r) => r.id)} />
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="tv-bg" />
      <div className="tv-header">
        <Logo className="logo" />
        <div className="divider" />
        <div className="title"><b>Election Night</b> 2026</div>
        <div className="spacer" />
        <Clock />
        <div className="stripe" />
      </div>
      <div className="tv-body">{body ?? <div className="empty-msg">Select a view in /control</div>}</div>
      <div className="tv-banner">
        <Presence show={!!alert} k={alert?.id}>{alert && <Banner a={alert} />}</Presence>
      </div>
    </>
  );
}

/** Transparent key output for the switcher; every element cues on its own. */
export function GfxScreen({ s }: { s: PublicState }) {
  const { gfx } = s.show;
  const alert = activeAlert(s);
  const lt = raceView(s, gfx.lowerThird.raceId);
  return (
    <>
      <Presence show={gfx.bop.on}><BopBug s={s} /></Presence>
      <Presence show={gfx.lowerThird.on && !!lt} k={gfx.lowerThird.raceId}>{lt && <LowerThird v={lt} />}</Presence>
      <Presence show={gfx.ticker.on} k={gfx.ticker.set}><Ticker s={s} set={gfx.ticker.set} /></Presence>
      <Presence show={!!alert} k={alert?.id}>{alert && <Banner a={alert} />}</Presence>
      <GfxLogo />
    </>
  );
}
