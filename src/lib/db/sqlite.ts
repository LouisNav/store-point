// SQLite connection (singleton). WAL mode for crash safety. Idempotent migrations.

import path from 'node:path';
import fs from 'node:fs';
import Database, { type Database as DB } from 'better-sqlite3';
import { env } from '@/env';
import { MIGRATIONS } from './schema';

let db: DB | null = null;

export function getDB(): DB {
  if (db) return db;

  const dbPath = path.resolve(process.cwd(), env().SQLITE_PATH);
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  db = new Database(dbPath);

  // Crash-safety settings. WAL is the headline.
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');

  runMigrations(db);
  return db;
}

function runMigrations(d: DB) {
  d.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  const stored = d
    .prepare<[string], { value: string }>('SELECT value FROM meta WHERE key = ?')
    .get('migrations_applied');
  const done = stored ? new Set<string>(stored.value.split(',')) : new Set<string>();

  const insertMeta = d.prepare(
    'INSERT OR REPLACE INTO meta(key, value) VALUES(?, ?)',
  );

  for (const m of MIGRATIONS) {
    if (done.has(m.id)) continue;
    // Pre-flight check: if the migration declares a `check` and the schema
    // already matches, we still record it as applied so re-runs are no-ops.
    if (m.check && m.check(d)) {
      const next = [...done, m.id].join(',');
      insertMeta.run('migrations_applied', next);
      done.add(m.id);
      // eslint-disable-next-line no-console
      console.log(`[sqlite] migration ${m.id} already in place — marked applied`);
      continue;
    }
    try {
      d.transaction(() => {
        d.exec(m.sql);
        const next = [...done, m.id].join(',');
        insertMeta.run('migrations_applied', next);
      })();
      done.add(m.id);
      // eslint-disable-next-line no-console
      console.log(`[sqlite] applied migration ${m.id}`);
    } catch (e) {
      throw new Error(`Migration ${m.id} failed: ${(e as Error).message}`);
    }
  }
}

/** Close the DB (used by tests / shutdown). */
export function closeDB() {
  if (db) {
    db.close();
    db = null;
  }
}
