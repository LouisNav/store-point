// Drain helpers — shared between the standalone sync worker and integration tests.
// Drains the SQLite outbox into the configured MongoDB connection.

import type { OutboxRow } from './types';
import { outboxRepo } from './db/repositories/outbox.repo';
import { M } from './db/mongo-models';
import { getMongo, isMongoReachable } from './db/mongo';
import { env } from '@/env';

/**
 * Push a single outbox row into Mongo. Returns true on success.
 */
export async function syncOne(row: OutboxRow): Promise<void> {
  const payload = JSON.parse(row.payloadJson);
  const model = (M as Record<string, import('mongoose').Model<unknown>>)[row.collection];
  if (!model) {
    // Unknown collection \u2014 record it as synced so the queue can drain.
    outboxRepo.markSynced(row.id);
    return;
  }
  if (row.op === 'soft_delete') {
    await model.updateOne(
      { _id: row.docId },
      { $set: { deletedAt: payload.deletedAt ?? new Date().toISOString() } },
    );
  } else {
    await model.updateOne({ _id: row.docId }, payload, { upsert: true });
  }
  outboxRepo.markSynced(row.id);
}

/**
 * Drain up to `batchSize` outbox rows into Mongo.
 * Returns the number of rows processed.
 */
export async function drainOutbox(batchSize?: number): Promise<number> {
  const cfg = env();
  const size = batchSize ?? cfg.SYNC_BATCH_SIZE;
  if (!cfg.MONGODB_URI) return 0;
  if (!(await isMongoReachable())) return 0;
  await getMongo();
  const batch = outboxRepo.pending(size);
  for (const row of batch) {
    try {
      await syncOne(row);
    } catch (e) {
      // Throw to let the worker decide on backoff; stop draining this tick.
      throw new Error(`row ${row.id} failed: ${(e as Error).message}`);
    }
  }
  return batch.length;
}

/**
 * Drain ALL pending outbox rows (used by tests / one-shot scripts). Loops
 * until the queue is empty or `maxIterations` is hit.
 */
export async function syncNow(maxIterations = 50): Promise<number> {
  let total = 0;
  for (let i = 0; i < maxIterations; i++) {
    const n = await drainOutbox(500);
    total += n;
    if (n < 500) break;
  }
  return total;
}
