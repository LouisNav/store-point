// Tiny in-memory throttle for the login route. Good enough for v1.
// Per-key (email + ip combo): allow 5 attempts per 15-minute window.
// Resets on server restart — acceptable since the worst case is unbounded
// attempts for the duration of one server lifetime. For production: move
// to Redis or DB-backed rate limit.

type Bucket = { hits: number[] };

const buckets = new Map<string, Bucket>();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_HITS = 5;

export function loginThrottle(key: string): { allowed: boolean; retryAfterMs?: number } {
  const now = Date.now();
  const cutoff = now - WINDOW_MS;
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { hits: [] };
    buckets.set(key, bucket);
  }
  bucket.hits = bucket.hits.filter((t) => t >= cutoff);
  if (bucket.hits.length >= MAX_HITS) {
    return {
      allowed: false,
      retryAfterMs: Math.max(1000, (bucket.hits[0] + WINDOW_MS) - now),
    };
  }
  bucket.hits.push(now);
  return { allowed: true };
}

/** Periodic cleanup so the Map doesn't grow without bound. */
setInterval(() => {
  const cutoff = Date.now() - WINDOW_MS;
  for (const [k, v] of buckets) {
    v.hits = v.hits.filter((t) => t >= cutoff);
    if (v.hits.length === 0) buckets.delete(k);
  }
}, WINDOW_MS).unref();
