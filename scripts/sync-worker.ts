/**
 * Standalone sync worker. Run with `npm run worker` (or part of `npm run dev:full`).
 *
 * Drains the SQLite outbox into MongoDB.
 *  - Loops every SYNC_INTERVAL_MS.
 *  - Connects to Mongo on first run, retries on failure (no crash).
 *  - Marks rows as syncedAt once Mongo acks.
 *  - Single-node assumption: no pull-down replication.
 *  - Exponential backoff on consecutive failures (capped at SYNC_BACKOFF_MAX_MS)
 *    so a downed Mongo doesn't hot-loop the worker.
 */

import fs from 'node:fs';
import path from 'node:path';

// Load .env manually.
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+)\s*$/i);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}

import { env } from '../src/env';
import { closeDB, getDB } from '../src/lib/db/sqlite';
import { closeMongo } from '../src/lib/db/mongo';
import { outboxRepo } from '../src/lib/db/repositories/outbox.repo';
import { drainOutbox } from '../src/lib/sync';

const cfg = env();

// Guard: tsx watch auto-reloads on file changes — dangerous in production.
// PM2 handles restarts properly. If this isn't PM2, warn and exit.
if (process.env.NODE_ENV === 'production' && process.env.SYNC_RUNNER !== 'pm2') {
  console.error(
    '✗ sync-worker: not started via PM2 in production mode.\n' +
    '  Do not use tsx watch or node --watch in production.\n' +
    '  Use PM2:          npm run pm2:start    (auto-restart on crash + reboot)\n' +
    '  Or plain tsx:    SYNC_RUNNER=pm2 npm run worker  (single process)\n' +'    Set SYNC_RUNNER=pm2 to bypass this guard if you know what you are doing.',
  );
  process.exit(1);
}

let failureStreak = 0;
let warned = false;

function nextDelayMs(): number {
  if (failureStreak === 0) return cfg.SYNC_INTERVAL_MS;
  // Exponential: 2s, 4s, 8s, 16s, ... capped at SYNC_BACKOFF_MAX_MS.
  return Math.min(
    cfg.SYNC_BACKOFF_MAX_MS,
    2000 * Math.pow(2, Math.min(failureStreak - 1, 10)),
  );
}

async function tick(): Promise<boolean> {
  try {
    const n = await drainOutbox();
    if (n > 0 && cfg.MONGODB_URI) {
      console.log(`[sync] flushed ${n} op(s); total pending: ${outboxRepo.pendingCount()}`);
    }
    return true;
  } catch (e) {
    console.warn('[sync] tick error:', (e as Error).message);
    return false;
  }
}

async function loop() {
  getDB();
  console.log(
    `[sync-worker] started · mode=${cfg.MONGODB_URI ? 'online' : 'offline'} · interval=${cfg.SYNC_INTERVAL_MS}ms · backoff-cap=${cfg.SYNC_BACKOFF_MAX_MS}ms · batch=${cfg.SYNC_BATCH_SIZE}`,
  );
  schedule();
}

function schedule() {
  setTimeout(async () => {
    const ok = await tick();
    if (!ok) {
      failureStreak += 1;
      if (!warned) {
        console.warn(`[sync-worker] Mongo unreachable; entering backoff mode (cap ${cfg.SYNC_BACKOFF_MAX_MS}ms)`);
        warned = true;
      }
    } else {
      if (failureStreak > 0) {
        console.log(`[sync-worker] Mongo recovered after ${failureStreak} failed tick(s)`);
      }
      failureStreak = 0;
      warned = false;
    }
    schedule();
  }, nextDelayMs());
  // Reset streak before next failure so :false path above increments fresh.
  if (failureStreak === 0) failureStreak = 0;
}

loop().catch((e) => {
  console.error('[sync-worker] fatal:', e?.message ?? e);
  process.exit(1);
});

process.on('SIGINT', async () => {
  console.log('\n[sync-worker] shutting down\u2026');
  await closeMongo();
  closeDB();
  process.exit(0);
});
process.on('SIGTERM', async () => {
  console.log('\n[sync-worker] shutting down\u2026');
  await closeMongo();
  closeDB();
  process.exit(0);
});
