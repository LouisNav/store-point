import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth/guards';

const schema = z.object({ storeId: z.string().min(1) });

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Bad input' }, { status: 400 });
  const s = await getSession();
  if (!s.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!s.memberships?.some((m) => m.storeId === parsed.data.storeId)) {
    return NextResponse.json({ error: 'Not a member' }, { status: 403 });
  }
  s.activeStoreId = parsed.data.storeId;
  await s.save();
  return NextResponse.json({ ok: true, activeStoreId: s.activeStoreId });
}
