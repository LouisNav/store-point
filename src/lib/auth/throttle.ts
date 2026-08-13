// Throttle helpers built on the DB-backed rate limiter. Interfaces are
// unchanged from the previous in-memory version so call sites need no changes.

import { take, reset, pruneRateLimits } from './rate-limit';

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_HITS = 5;

const MESSAGE_WINDOW_MS = 60 * 1000;
const MESSAGE_MAX_HITS = 30;

export function loginThrottle(key: string): { allowed: boolean; retryAfterMs?: number } {
  return take(`login:${key}`, { windowMs: LOGIN_WINDOW_MS, maxHits: LOGIN_MAX_HITS });
}

/** Successful login clears the failure counter for the email+IP key. */
export function clearLoginThrottle(key: string): void {
  reset(`login:${key}`);
}

/** A lightweight guard against accidental or malicious message floods. */
export function messagingThrottle(key: string): { allowed: boolean; retryAfterMs?: number } {
  return take(`msg:${key}`, { windowMs: MESSAGE_WINDOW_MS, maxHits: MESSAGE_MAX_HITS });
}

/** Periodic cleanup so the hits table doesn't grow without bound. */
setInterval(() => {
  try {
    pruneRateLimits(Math.max(LOGIN_WINDOW_MS, MESSAGE_WINDOW_MS));
  } catch {
    /* DB may not be open yet — the next sweep will catch up. */
  }
}, LOGIN_WINDOW_MS).unref();
