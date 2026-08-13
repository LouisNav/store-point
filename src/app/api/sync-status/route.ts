import { NextResponse } from 'next/server';
import { getOptionalUser } from '@/lib/auth/guards';
import { outboxRepo } from '@/lib/db/repositories/outbox.repo';
import { getMongo } from '@/lib/db/mongo';
import { env } from '@/env';

export async function GET() {
  const s = await getOptionalUser();
  if (!s || !s.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const pending = outboxRepo.pendingCount();
  let online = false;
  if (env().MONGODB_URI) {
    const conn = await getMongo();
    online = !!conn;
  }
  return NextResponse.json({
    state: online ? 'online' : 'offline',
    pending,
    mongoConfigured: !!env().MONGODB_URI,
  });
}
