'use server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import bcrypt from 'bcryptjs';
import { getDB } from '@/lib/db/sqlite';
import { nowISO } from '@/lib/types';
import { newId } from '@/lib/ids';
import { usersRepo } from '@/lib/db/repositories/users.repo';
import { membershipsRepo } from '@/lib/db/repositories/memberships.repo';
import { getSession } from '@/lib/auth/guards';
import { can } from '@/lib/rbac';
import { Permission } from '@/lib/rbac';
import { ROLES, type Role } from '@/lib/types';

function ensure(role: Role | undefined, perm: typeof Permission[keyof typeof Permission]) {
  if (!role) throw new Error('No membership');
  if (!can(role, perm)) throw new Error('Not allowed');
}

export async function addStaff(storeId: string, input: { name: string; email: string; password: string; role: Role }) {
  const session = await getSession();
  if (!session.userId) return { error: 'Unauthorized' };
  const m = membershipsRepo.activeRole(session.userId, storeId);
  ensure(m?.role, Permission.UsersManage);
  if (input.role === 'ROOT_ADMIN' && !session.isRoot) return { error: 'Only root admin can grant ROOT_ADMIN.' };
  if (usersRepo.byEmail(input.email)) return { error: 'A user with that email already exists.' };
  try {
    const user = await usersRepo.create({
      email: input.email,
      name: input.name,
      password: input.password,
    });
    membershipsRepo.upsert(user.id, storeId, input.role);
    revalidatePath('/users');
    return { ok: true, userId: user.id };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function changeRole(membershipId: string, role: Role) {
  if (!ROLES.includes(role)) return { error: 'Bad role' };
  const session = await getSession();
  if (!session.userId || !session.activeStoreId) return { error: 'Unauthorized' };
  const mCheck = membershipsRepo.activeRole(session.userId, session.activeStoreId);
  ensure(mCheck?.role, Permission.UsersManage);
  if (role === 'ROOT_ADMIN' && !session.isRoot) return { error: 'Only root admin can promote to ROOT_ADMIN.' };
  const m = getDB()
    .prepare<[string], import('@/lib/types').Membership>(
      'SELECT * FROM memberships WHERE id = ? AND deletedAt IS NULL',
    )
    .get(membershipId);
  if (!m) return { error: 'Not found' };
  if (m.storeId !== session.activeStoreId) return { error: 'Wrong store' };
  if (m.userId === session.userId && m.role === 'ROOT_ADMIN' && role !== 'ROOT_ADMIN') {
    return { error: 'You cannot demote yourself.' };
  }
  membershipsRepo.upsert(m.userId, m.storeId, role);
  revalidatePath('/users');
  return { ok: true };
}

export async function suspendMembership(membershipId: string) {
  const session = await getSession();
  if (!session.userId || !session.activeStoreId) return { error: 'Unauthorized' };
  const mCheck = membershipsRepo.activeRole(session.userId, session.activeStoreId);
  ensure(mCheck?.role, Permission.UsersManage);
  membershipsRepo.setActive(membershipId, false);
  revalidatePath('/users');
  return { ok: true };
}

export async function reactivateMembership(membershipId: string) {
  const session = await getSession();
  if (!session.userId || !session.activeStoreId) return { error: 'Unauthorized' };
  const mCheck = membershipsRepo.activeRole(session.userId, session.activeStoreId);
  ensure(mCheck?.role, Permission.UsersManage);
  membershipsRepo.setActive(membershipId, true);
  revalidatePath('/users');
  return { ok: true };
}

export async function removeMembership(membershipId: string) {
  const session = await getSession();
  if (!session.userId || !session.activeStoreId) return { error: 'Unauthorized' };
  const mCheck = membershipsRepo.activeRole(session.userId, session.activeStoreId);
  ensure(mCheck?.role, Permission.UsersManage);
  const m = getDB()
    .prepare<[string], import('@/lib/types').Membership>(
      'SELECT * FROM memberships WHERE id = ? AND deletedAt IS NULL',
    )
    .get(membershipId);
  if (!m) return { error: 'Not found' };
  if (m.userId === session.userId) return { error: 'You cannot remove yourself.' };
  membershipsRepo.softDelete(membershipId);
  revalidatePath('/users');
  return { ok: true };
}

// ---- Seed helpers (also used by /setup page) ----

export async function bootstrapRootFromEnv() {
  const session = await getSession();
  // Anyone can call this only if there are zero users (we check before).
  const existing = usersRepo.list();
  if (existing.length > 0) return { error: 'Already initialized.' };
  const email = process.env.ROOT_ADMIN_EMAIL ?? '';
  const password = process.env.ROOT_ADMIN_PASSWORD ?? '';
  const name = process.env.ROOT_ADMIN_NAME ?? 'Root';
  if (!email || !password) return { error: 'ROOT_ADMIN_EMAIL / ROOT_ADMIN_PASSWORD missing in .env.' };
  await usersRepo.create({ email, password, name, isRoot: true });
  return { ok: true };
}
