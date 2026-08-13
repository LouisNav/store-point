import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getOptionalUser, isRootUser } from '@/lib/auth/guards';
import { membershipsRepo } from '@/lib/db/repositories/memberships.repo';
import { storesRepo } from '@/lib/db/repositories/stores.repo';
import { auditRepo } from '@/lib/db/repositories/audit.repo';

const schema = z.object({ storeId: z.string().min(1) });

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Bad input' }, { status: 400 });
  const s = await getOptionalUser();
  if (!s || !s.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!storesRepo.byId(parsed.data.storeId)) {
    return NextResponse.json({ error: 'Store not found' }, { status: 404 });
  }
  const root = await isRootUser(s);
  if (!root && !membershipsRepo.activeRole(s.userId, parsed.data.storeId)) {
    return NextResponse.json({ error: 'Not a member' }, { status: 403 });
  }
  const fromStoreId = s.activeStoreId ?? null;
  s.activeStoreId = parsed.data.storeId;
  await s.save();
  auditRepo.record({
    storeId: parsed.data.storeId,
    actorId: s.userId,
    actorEmail: s.email ?? null,
    action: 'store.switch',
    entityType: 'Store',
    entityId: parsed.data.storeId,
    metadata: { fromStoreId, toStoreId: parsed.data.storeId },
  });
  return NextResponse.json({ ok: true, activeStoreId: s.activeStoreId });
}
