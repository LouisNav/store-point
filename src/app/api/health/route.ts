import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/guards';
import { getDB } from '@/lib/db/sqlite';
import { outboxRepo } from '@/lib/db/repositories/outbox.repo';
import { getMongo } from '@/lib/db/mongo';
import { env } from '@/env';

export async function GET() {
  const s = await getSession();
  if (!s.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const cfg = env();
  const results: Record<string, { status: 'ok' | 'error' | 'disabled'; detail?: string }> = {};

  // SQLite
  try {
    const db = getDB();
    const row = db.prepare('SELECT 1 as ok').get() as { ok: number } | undefined;
    results.sqlite = { status: row?.ok === 1 ? 'ok' : 'error' };
  } catch (e) {
    results.sqlite = { status: 'error', detail: (e as Error).message };
  }

  // MongoDB — reuse cached connection from getMongo() to avoid connection leaks
  if (!cfg.MONGODB_URI) {
    results.mongo = { status: 'disabled', detail: 'MONGODB_URI not configured' };
  } else {
    try {
      const conn = await getMongo();
      if (conn && conn.connection.readyState === 1) {
        await conn.connection.db?.admin().ping();
        results.mongo = { status: 'ok', detail: 'connected' };
      } else {
        results.mongo = { status: 'error', detail: 'unreachable' };
      }
    } catch (e) {
      results.mongo = { status: 'error', detail: (e as Error).message };
    }
  }

  // Sync queue
  const pending = outboxRepo.pendingCount();
  const total = outboxRepo.totalCount();
  results.sync = {
    status: pending > 100 ? 'error' : 'ok',
    detail: `${pending} pending / ${total} total outbox rows`,
  };

  const allOk = Object.values(results).every((r) => r.status === 'ok' || r.status === 'disabled');

  return NextResponse.json(
    {
      status: allOk ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      services: results,
    },
    {
      status: allOk ? 200 : 503,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store',
      },
    },
  );
}
