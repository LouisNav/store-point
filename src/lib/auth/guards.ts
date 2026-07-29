// Auth guards. Use in server components, server actions, and API route handlers.

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getIronSession, type IronSession } from 'iron-session';
import { sessionOptions, type SessionData } from './session';
import { can as roleCan, canAny as roleCanAny, type PermissionKey } from '../rbac';
import type { Role } from '../types';
import { membershipsRepo } from '../db/repositories/memberships.repo';

export async function getSession(): Promise<IronSession<SessionData>> {
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, sessionOptions);
}

export async function getOptionalUser(): Promise<IronSession<SessionData> | null> {
  const s = await getSession();
  if (!s.userId) return null;
  return s;
}

export async function requireUser(): Promise<IronSession<SessionData>> {
  const s = await getSession();
  if (!s.userId) redirect('/login');
  return s;
}

export async function requireActiveStore(): Promise<{
  session: IronSession<SessionData>;
  storeId: string;
  role: Role;
}> {
  const s = await requireUser();
  const userId = s.userId!;
  if (!s.activeStoreId) redirect('/stores');
  const storeId = s.activeStoreId;

  // Verify the membership still exists in DB — the session cookie may be stale
  // if a manager suspended or removed the user from this store.
  const dbRole = membershipsRepo.activeRole(userId, storeId);
  if (!dbRole) {
    // Membership was revoked — clear stale activeStoreId and re-route.
    // No need to filter session.memberships here; the /stores page queries
    // the DB directly and will show the user's real remaining stores.
    s.activeStoreId = undefined;
    await s.save();
    redirect('/stores');
  }

  const ms = s.memberships?.find((m) => m.storeId === storeId);
  if (!ms) redirect('/stores');
  return { session: s, storeId, role: ms.role };
}

export async function requireRoot(): Promise<IronSession<SessionData>> {
  const s = await requireUser();
  if (!s.isRoot) redirect('/stores');
  return s;
}

export function can(role: Role | undefined, perm: PermissionKey): boolean {
  return roleCan(role, perm);
}
export function canAny(role: Role | undefined, perms: PermissionKey[]): boolean {
  return roleCanAny(role, perms);
}
