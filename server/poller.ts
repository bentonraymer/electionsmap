// Polls civicAPI: national aggregates on an interval, per-race detail through a rate-limited queue.
import type { FeedRace } from './civic.js';
import { fetchAggregate, fetchRace } from './civic.js';
import { config } from './config.js';
import { seed, store } from './store.js';

type Sink = (races: FeedRace[]) => void;

export function startPoller(sink: Sink, opts: { once?: boolean } = {}) {
  const fetchedOnce = new Set<number>();
  const lastOnAir = new Map<number, number>();
  let queue: number[] = [];

  const ok = () => store.setHealth({ lastSuccess: new Date().toISOString(), lastError: undefined });
  const fail = (e: unknown) => {
    console.warn('[poller]', (e as Error).message);
    store.setHealth({ lastError: (e as Error).message, errorCount: store.health.errorCount + 1 });
  };

  async function pollAggregates() {
    for (const id of [seed.senateAggregate, seed.houseAggregate]) {
      if (opts.once && fetchedOnce.has(id)) continue;
      try {
        sink(await fetchAggregate(id));
        fetchedOnce.add(id);
        ok();
      } catch (e) { fail(e); }
    }
  }

  async function detailTick() {
    // On-air races jump the queue so the race on /tv is never stale.
    const now = Date.now();
    let id = store.onAirRaceIds().find((r) =>
      opts.once ? !fetchedOnce.has(r) : now - (lastOnAir.get(r) ?? 0) > config.onAirInterval);
    if (id) lastOnAir.set(id, now);
    else {
      if (!queue.length) queue = store.detailRaceIds().filter((r) => !opts.once || !fetchedOnce.has(r));
      id = queue.shift();
    }
    if (!id) return;
    try {
      sink([await fetchRace(id)]);
      fetchedOnce.add(id);
      ok();
    } catch (e) { fail(e); }
  }

  void pollAggregates();
  setInterval(pollAggregates, config.pollInterval);
  const spacing = Math.max(200, 1000 / config.detailRps);
  let busy = false;
  setInterval(async () => {
    if (busy) return;
    busy = true;
    try { await detailTick(); } finally { busy = false; }
  }, spacing);
}
