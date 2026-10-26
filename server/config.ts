const env = process.env;

export const config = {
  port: Number(env.PORT ?? 8080),
  host: env.HOST ?? '0.0.0.0',
  dataDir: env.DATA_DIR ?? './data',
  controlPassword: env.CONTROL_PASSWORD ?? 'changeme',
  cookieSecret: env.COOKIE_SECRET ?? env.CONTROL_PASSWORD ?? 'electionsmap-dev-secret-change-me',
  displayToken: env.DISPLAY_TOKEN || undefined,
  civicBase: env.CIVICAPI_BASE ?? 'https://civicapi.org/api/v2',
  pollInterval: Number(env.POLL_INTERVAL ?? 30) * 1000, // national aggregates
  detailRps: Number(env.DETAIL_RPS ?? 1), // per-race detail requests per second
  onAirInterval: Number(env.ON_AIR_INTERVAL ?? 15) * 1000, // race on /tv refresh
  simulate: env.SIMULATE === '1' || env.SIMULATE === 'true',
  simSpeed: Number(env.SIM_SPEED ?? 1),
  isProd: env.NODE_ENV === 'production',
};

// Rehearsal data never mixes with the real election-night database.
if (config.simulate) config.dataDir = config.dataDir.replace(/\/$/, '') + '/sim';

if (config.isProd && config.controlPassword === 'changeme') {
  console.warn('[config] CONTROL_PASSWORD is not set; using the default "changeme". Set it before going live.');
}
