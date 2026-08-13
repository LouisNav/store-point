import { NextResponse } from 'next/server';
import { z } from 'zod';
import { usersRepo } from '@/lib/db/repositories/users.repo';
import { membershipsRepo } from '@/lib/db/repositories/memberships.repo';
import { storesRepo } from '@/lib/db/repositories/stores.repo';
import { verifyPassword } from '@/lib/auth/password';
import { getSession } from '@/lib/auth/guards';
import { loginThrottle, clearLoginThrottle } from '@/lib/auth/throttle';
import { auditRepo } from '@/lib/db/repositories/audit.repo';

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 400 });
  }
  const { email, password } = parsed.data;

  // Throttle by email + IP. The IP-based throttle prevents spraying many
  // emails against one IP; the email-based throttle prevents targeted
  // email brute force from a rotating IP.
  const ip = (req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown').slice(0, 64);
  const throttleKey = `${email.toLowerCase()}|${ip}`;
  const throttle = loginThrottle(throttleKey);
  if (!throttle.allowed) {
    return NextResponse.json(
      { error: 'Too many attempts. Try again later.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((throttle.retryAfterMs ?? 60000) / 1000)) } },
    );
  }

  const user = usersRepo.byEmail(email);
  // Constant-ish message to avoid email enumeration.
  if (!user) {
    auditRepo.record({ action: 'auth.login_failure', actorEmail: email.toLowerCase(), metadata: { reason: 'unknown_email' }, ip });
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    auditRepo.record({ action: 'auth.login_failure', actorId: user.id, actorEmail: user.email, metadata: { reason: 'bad_password' }, ip });
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
  }

  // A successful login resets the failure counter and is recorded in the audit log.
  clearLoginThrottle(throttleKey);
  auditRepo.record({ action: 'auth.login_success', actorId: user.id, actorEmail: user.email, ip });

  const memberships = membershipsRepo.forUser(user.id).map((m) => {
    const s = storesRepo.byId(m.storeId);
    return { storeId: m.storeId, storeName: s?.name ?? 'Unknown', role: m.role };
  });

  const session = await getSession();
  session.userId = user.id;
  session.email = user.email;
  session.name = user.name;
  session.isRoot = user.isRoot === 1;
  session.memberships = memberships;
  session.activeStoreId = memberships[0]?.storeId;
  await session.save();

  return NextResponse.json({
    ok: true,
    name: user.name,
    activeStoreId: session.activeStoreId,
    memberships,
  });
}
