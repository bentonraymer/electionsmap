// Tiny key/value store on SQLite (node:sqlite, built into Node >= 22.13).
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config } from './config.js';

mkdirSync(config.dataDir, { recursive: true });
const dbPath = join(config.dataDir, 'electionsmap.db');
let db: DatabaseSync;
try {
  db = new DatabaseSync(dbPath);
} catch (e) {
  console.error(`[db] Cannot open ${dbPath}: ${(e as Error).message}. Check that the data folder is writable (uid ${process.getuid?.()}).`);
  process.exit(1);
}
db.exec('PRAGMA journal_mode = WAL');
db.exec('CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL)');

const getStmt = db.prepare('SELECT value FROM kv WHERE key = ?');
const setStmt = db.prepare(
  'INSERT INTO kv (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
);

export function load<T>(key: string, fallback: T): T {
  const row = getStmt.get(key) as { value: string } | undefined;
  if (!row) return fallback;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return fallback;
  }
}

export function save(key: string, value: unknown) {
  setStmt.run(key, JSON.stringify(value), Date.now());
}
