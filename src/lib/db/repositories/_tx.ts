// Repository helpers. All writes go through `writeWithOutbox`, which atomically
// (a) writes the row in SQLite, and (b) appends to the outbox for Mongo sync.

import type { Database as DB } from 'better-sqlite3';
import { getDB } from '../sqlite';
import { nowISO } from '../../types';

export type Op = 'upsert' | 'soft_delete';

export interface OutboxEntry {
  op: Op;
  collection: string;
  docId: string;
  payload: unknown;
}

function enqueueOutbox(d: DB, entries: OutboxEntry[]) {
  const stmt = d.prepare(
    'INSERT INTO outbox(op, collection, docId, payloadJson, createdAt) VALUES(?, ?, ?, ?, ?)',
  );
  for (const e of entries) {
    stmt.run(e.op, e.collection, e.docId, JSON.stringify(e.payload), nowISO());
  }
}

/**
 * Run `fn` inside a SQLite transaction. The function may return an array of
 * outbox entries that will be enqueued atomically with the writes.
 */
export function writeTx<T>(
  fn: (d: DB) => { result: T; outbox: OutboxEntry[] },
): T {
  const d = getDB();
  let result!: T;
  d.transaction(() => {
    const out = fn(d);
    enqueueOutbox(d, out.outbox);
    result = out.result;
  })();
  return result;
}

/** Convenience for single-entry outbox writes. */
export function simpleWriteTx<T>(fn: (d: DB) => {
  result: T;
  collection: string;
  docId: string;
  payload: unknown;
}): T {
  return writeTx((d) => {
    const { result, collection, docId, payload } = fn(d);
    return {
      result,
      outbox: [{ op: 'upsert', collection, docId, payload }],
    };
  });
}
