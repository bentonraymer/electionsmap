# TUTV Election Night (electionsmap)

Live election graphics for the 2026 midterms, driven from laptops in the studio and the booth (one shared password):

| URL | Where it goes | What it is |
| --- | --- | --- |
| `/studio` | Analyst laptops | Results, county drill-down, race calls, overrides, what's on the TV |
| `/booth` | Booth producer | GFX key layers, lower third, alert queue / breaking banners |
| `/control` | Anyone | Landing page linking to Studio and Booth |
| `/tv` | In-studio TV | Full-screen 1920×1080 maps, race results, big boards, balance of power |
| `/gfx` | Switcher (browser source) | Transparent 1920×1080 key: lower third, ticker, BoP bug, alert banners |

Every output follows the server's show state, so a page that reloads or reconnects comes straight back to what's on air.

## Data

Results come from [civicAPI](https://civicapi.org), which is free and needs no API key:
- **Senate and House:** two national aggregate races (`87528`, `87524`) cover every 2026 Senate race and all 435 House districts. They're polled every `POLL_INTERVAL` seconds.
- **Governors, Oklahoma races and starred races:** polled one at a time at `DETAIL_RPS` requests/second.
- **The race on `/tv`:** refreshed every `ON_AIR_INTERVAL` seconds, with county results for the map.

civicAPI is a free service with no uptime guarantee, so `/studio` can **override** any race's votes or % reporting. **Freeze feed** holds the published numbers steady during a live hit. If the feed goes down, the displays keep showing the last good data.

**Race calls are manual.** A feed winner flag only appears as a hint in `/studio`. When you call a race, the server queues an alert. A seat that changes party becomes a **PICKUP / seat-flip** alert, and a chamber crossing the majority line becomes a **control projection**. The booth chooses when each alert airs, unless **Auto-air alerts** is on. The House tally counts feed winners automatically, because hand-calling 435 races isn't practical.

The race catalog is `server/seed/races.json`. Rebuild it with `npm run seed`. Key races and the parties holding each seat going in are set at the top of `scripts/build-seed.ts`.

## Run it

```bash
cp .env.example .env    # set CONTROL_PASSWORD and COOKIE_SECRET
docker compose up -d
```

Point your reverse proxy at port 8080, and make sure it passes WebSocket upgrades on `/ws`.

- **`/gfx` in OBS/vMix:** add a Browser Source at 1920×1080. The page background is transparent.
- **Locking the outputs:** set `DISPLAY_TOKEN` and use `/tv?token=...` and `/gfx?token=...`.

### Rehearsal mode

`SIMULATE=1` loads the real races from civicAPI and fakes an election night on top of them, with counties filling in and races getting called. Rehearsal data is stored in `/data/sim`, so it never mixes with live data. Use `SIM_SPEED=5` to speed it up. **Reset calls, overrides & alerts** in Settings clears everything after a run-through.

## Develop

```bash
npm install
npm run dev:sim    # server :8080 + Vite :5173, simulated results; password "changeme"
npm run typecheck
npm run build && npm start
```

Pushes to `main` build a multi-arch image to `ghcr.io/bentonraymer/electionsmap` (see `.github/workflows/docker.yml`).

## Keyboard

- **Studio:** `↑/↓` select race · `Enter` race to TV
- **Booth:** `↑/↓` select race · `Enter` lower third · `L` toggle lower third · `T` ticker · `B` BoP bug · `Esc` clear all GFX

## County drill-down

Select a race in `/studio` and the **Counties** card loads its county results (opening it moves the race to the front of the poll queue). Sort the table by any column, find counties by name, or click them on the map. Pick up to four, then **Show on TV** to put the state map, with those counties highlighted, and their results on `/tv`.
