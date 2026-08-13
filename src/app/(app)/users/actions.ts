'use server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import bcrypt from 'bcryptjs';
import { getDB } from '@/lib/db/sqlite';
import { nowISO } from '@/lib/types';
import { newId } from '@/lib/ids';
import { usersRepo } from '@/lib/db/repositories/users.repo';
import { membershipsRepo } from '@/lib/db/repositories/memberships.repo';
import { storesRepo } from '@/lib/db/repositories/stores.repo';
import { productsRepo } from '@/lib/db/repositories/products.repo';
import { auditRepo } from '@/lib/db/repositories/audit.repo';
import { demoProducts } from '@/lib/demo-data';
import { isRootUser, requireUser } from '@/lib/auth/guards';
import { hasAnyUser } from '@/lib/auth/bootstrap';
import { can } from '@/lib/rbac';
import { Permission } from '@/lib/rbac';
import { ROLES, type Role } from '@/lib/types';

function ensure(role: Role | undefined, perm: typeof Permission[keyof typeof Permission]) {
  if (!role) throw new Error('No membership');
  if (!can(role, perm)) throw new Error('Not allowed');
}

export async function addStaff(storeId: string, input: { name: string; email: string; password: string; role: Role }) {
  const session = await requireUser();
  if (!session.userId || session.activeStoreId !== storeId) return { error: 'Unauthorized' };
  const m = membershipsRepo.activeRole(session.userId, storeId);
  const actorIsRoot = await isRootUser(session);
  if (!actorIsRoot) ensure(m?.role, Permission.UsersManage);
  if (input.role === 'ROOT_ADMIN' && !actorIsRoot) return { error: 'Only root admin can grant ROOT_ADMIN.' };
  if (usersRepo.byEmail(input.email)) return { error: 'A user with that email already exists.' };
  try {
    const user = await usersRepo.create({
      email: input.email,
      name: input.name,
      password: input.password,
    });
    const membership = membershipsRepo.upsert(user.id, storeId, input.role);
    auditRepo.record({
      storeId,
      actorId: session.userId,
      actorEmail: session.email ?? null,
      action: 'user.invite',
      entityType: 'Membership',
      entityId: membership.id,
      metadata: { userId: user.id, email: user.email, role: input.role },
    });
    revalidatePath('/users');
    return { ok: true, userId: user.id };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function changeRole(membershipId: string, role: Role) {
  if (!ROLES.includes(role)) return { error: 'Bad role' };
  const session = await requireUser();
  if (!session.userId || !session.activeStoreId) return { error: 'Unauthorized' };
  const mCheck = membershipsRepo.activeRole(session.userId, session.activeStoreId);
  const actorIsRoot = await isRootUser(session);
  if (!actorIsRoot) ensure(mCheck?.role, Permission.UsersManage);
  if (role === 'ROOT_ADMIN' && !actorIsRoot) return { error: 'Only root admin can promote to ROOT_ADMIN.' };
  const m = getDB()
    .prepare<[string], import('@/lib/types').Membership>(
      'SELECT * FROM memberships WHERE id = ? AND deletedAt IS NULL',
    )
    .get(membershipId);
  if (!m) return { error: 'Not found' };
  if (m.storeId !== session.activeStoreId) return { error: 'Wrong store' };
  if ((m.role === 'ROOT_ADMIN' || role === 'ROOT_ADMIN') && !actorIsRoot) {
    return { error: 'Only root admin can change ROOT_ADMIN memberships.' };
  }
  if (m.userId === session.userId && m.role === 'ROOT_ADMIN' && role !== 'ROOT_ADMIN') {
    return { error: 'You cannot demote yourself.' };
  }
  membershipsRepo.upsert(m.userId, m.storeId, role);
  auditRepo.record({
    storeId: m.storeId,
    actorId: session.userId,
    actorEmail: session.email ?? null,
    action: 'user.role_change',
    entityType: 'Membership',
    entityId: m.id,
    metadata: { userId: m.userId, from: m.role, to: role },
  });
  revalidatePath('/users');
  return { ok: true };
}

export async function suspendMembership(membershipId: string) {
  const session = await requireUser();
  if (!session.userId || !session.activeStoreId) return { error: 'Unauthorized' };
  const mCheck = membershipsRepo.activeRole(session.userId, session.activeStoreId);
  const actorIsRoot = await isRootUser(session);
  if (!actorIsRoot) ensure(mCheck?.role, Permission.UsersManage);
  const target = getDB().prepare<[string], import('@/lib/types').Membership>('SELECT * FROM memberships WHERE id=? AND deletedAt IS NULL').get(membershipId);
  if (!target || target.storeId !== session.activeStoreId) return { error: 'Membership not found in the active store.' };
  if (target.role === 'ROOT_ADMIN' && !(await isRootUser(session))) return { error: 'Only root admin can suspend ROOT_ADMIN memberships.' };
  if (target.userId === session.userId) return { error: 'You cannot suspend yourself.' };
  membershipsRepo.setActive(membershipId, false);
  auditRepo.record({
    storeId: target.storeId,
    actorId: session.userId,
    actorEmail: session.email ?? null,
    action: 'user.suspend',
    entityType: 'Membership',
    entityId: target.id,
    metadata: { userId: target.userId },
  });
  revalidatePath('/users');
  return { ok: true };
}

export async function reactivateMembership(membershipId: string) {
  const session = await requireUser();
  if (!session.userId || !session.activeStoreId) return { error: 'Unauthorized' };
  const mCheck = membershipsRepo.activeRole(session.userId, session.activeStoreId);
  const actorIsRoot = await isRootUser(session);
  if (!actorIsRoot) ensure(mCheck?.role, Permission.UsersManage);
  const target = getDB().prepare<[string], import('@/lib/types').Membership>('SELECT * FROM memberships WHERE id=? AND deletedAt IS NULL').get(membershipId);
  if (!target || target.storeId !== session.activeStoreId) return { error: 'Membership not found in the active store.' };
  if (target.role === 'ROOT_ADMIN' && !(await isRootUser(session))) return { error: 'Only root admin can reactivate ROOT_ADMIN memberships.' };
  membershipsRepo.setActive(membershipId, true);
  auditRepo.record({
    storeId: target.storeId,
    actorId: session.userId,
    actorEmail: session.email ?? null,
    action: 'user.reactivate',
    entityType: 'Membership',
    entityId: target.id,
    metadata: { userId: target.userId },
  });
  revalidatePath('/users');
  return { ok: true };
}

export async function removeMembership(membershipId: string) {
  const session = await requireUser();
  if (!session.userId || !session.activeStoreId) return { error: 'Unauthorized' };
  const mCheck = membershipsRepo.activeRole(session.userId, session.activeStoreId);
  const actorIsRoot = await isRootUser(session);
  if (!actorIsRoot) ensure(mCheck?.role, Permission.UsersManage);
  const m = getDB()
    .prepare<[string], import('@/lib/types').Membership>(
      'SELECT * FROM memberships WHERE id = ? AND deletedAt IS NULL',
    )
    .get(membershipId);
  if (!m) return { error: 'Not found' };
  if (m.storeId !== session.activeStoreId) return { error: 'Membership not found in the active store.' };
  if (m.role === 'ROOT_ADMIN' && !actorIsRoot) return { error: 'Only root admin can remove ROOT_ADMIN memberships.' };
  if (m.userId === session.userId) return { error: 'You cannot remove yourself.' };
  membershipsRepo.softDelete(membershipId);
  auditRepo.record({
    storeId: m.storeId,
    actorId: session.userId,
    actorEmail: session.email ?? null,
    action: 'user.remove',
    entityType: 'Membership',
    entityId: m.id,
    metadata: { userId: m.userId, role: m.role },
  });
  revalidatePath('/users');
  return { ok: true };
}

// ---- Seed helpers (also used by /setup page) ----

export async function bootstrapRootFromEnv() {
  // This runs on the public /setup screen before any account exists, so there
  // is no session to require — guard on the user table instead.
  if (await hasAnyUser()) return { error: 'Already initialized.' };
  const email = process.env.ROOT_ADMIN_EMAIL ?? '';
  const password = process.env.ROOT_ADMIN_PASSWORD ?? '';
  const name = process.env.ROOT_ADMIN_NAME ?? 'Root';
  if (!email || !password) return { error: 'ROOT_ADMIN_EMAIL / ROOT_ADMIN_PASSWORD missing in .env.' };

  const root = await usersRepo.create({ email, password, name, isRoot: true });

  // Mirror the manual + seed flows so every bootstrap path leaves the operator
  // in the same state: a root account, a sample store, and demo products.
  const currency = (process.env.SEED_STORE_CURRENCY ?? 'USD').trim().toUpperCase() || 'USD';
  const symbol = process.env.SEED_STORE_CURRENCY_SYMBOL?.trim() ?? '';
  const slug = `store-${Math.random().toString(36).slice(2, 6)}-${Date.now().toString(36).slice(-4)}`;
  const store = storesRepo.create({
    slug,
    name: 'Greenmarket Demo',
    currency,
    brand: { accent: '#10b981', tagline: 'Fresh. Local. Daily.', currencySymbol: symbol || undefined },
  });
  membershipsRepo.upsert(root.id, store.id, 'ROOT_ADMIN');
  for (const p of demoProducts(currency)) productsRepo.create(store.id, p);

  return { ok: true };
}
