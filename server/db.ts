// Tiny key/value store on SQLite (node:sqlite, built into Node >= 22.13).
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config } from './config.js';

mkdirSync(config.dataDir, { recursive: true });
const db = new DatabaseSync(join(config.dataDir, 'electionsmap.db'));
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
