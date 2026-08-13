// DB-backed rate limiting. Unlike the previous in-memory implementation, hits
// are persisted in SQLite so limits survive server restarts and are shared
// across all processes/instances writing to the same database (single-node
// SQLite assumption). Old hits are pruned on every check plus a periodic sweep
// so the table cannot grow without bound.

import { getDB } from '@/lib/db/sqlite';

export interface RateLimitResult {
  allowed: boolean;
  retryAfterMs?: number;
}

export interface RateLimitSpec {
  windowMs: number;
  maxHits: number;
}

export function take(key: string, spec: RateLimitSpec): RateLimitResult {
  const d = getDB();
  const now = Date.now();
  const cutoff = now - spec.windowMs;

  d.prepare('DELETE FROM rate_limit_hits WHERE key = ? AND createdAt < ?').run(key, cutoff);

  const row = d
    .prepare<[string], { count: number; oldest: number | null }>(
      'SELECT COUNT(*) AS count, MIN(createdAt) AS oldest FROM rate_limit_hits WHERE key = ?',
    )
    .get(key);
  const count = row?.count ?? 0;
  if (count >= spec.maxHits) {
    const oldest = row?.oldest ?? now;
    return {
      allowed: false,
      retryAfterMs: Math.max(1000, oldest + spec.windowMs - now),
    };
  }

  d.prepare('INSERT INTO rate_limit_hits(key, createdAt) VALUES(?, ?)').run(key, now);
  return { allowed: true };
}

/** Clear hits for a key — e.g. after a successful login. */
export function reset(key: string): void {
  getDB().prepare('DELETE FROM rate_limit_hits WHERE key = ?').run(key);
}

/** Remove expired rows globally (called on an interval, unref'd). */
export function pruneRateLimits(maxAgeMs: number): number {
  const cutoff = Date.now() - maxAgeMs;
  const info = getDB()
    .prepare('DELETE FROM rate_limit_hits WHERE createdAt < ?')
    .run(cutoff);
  return info.changes;
}
