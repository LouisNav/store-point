// Auth guards. Use in server components, server actions, and API route handlers.

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getIronSession, type IronSession } from 'iron-session';
import { sessionOptions, type SessionData } from './session';
import { can as roleCan, canAny as roleCanAny, type PermissionKey } from '../rbac';
import type { Role } from '../types';
import { membershipsRepo } from '../db/repositories/memberships.repo';
import { usersRepo } from '../db/repositories/users.repo';

export async function getSession(): Promise<IronSession<SessionData>> {
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, sessionOptions);
}

export async function getOptionalUser(): Promise<IronSession<SessionData> | null> {
  const s = await getSession();
  if (!s.userId) return null;
  const user = usersRepo.byId(s.userId);
  if (!user) return null;
  s.email = user.email;
  s.name = user.name;
  s.isRoot = user.isRoot === 1;
  return s;
}

export async function requireUser(): Promise<IronSession<SessionData>> {
  const s = await getSession();
  if (!s.userId) redirect('/login');
  // A valid encrypted cookie is not sufficient proof that the account still
  // exists. Reject deleted users and refresh mutable identity claims from DB.
  const user = usersRepo.byId(s.userId);
  if (!user) redirect('/login');
  s.email = user.email;
  s.name = user.name;
  s.isRoot = user.isRoot === 1;
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
  const root = await isRootUser(s);
  if (!dbRole && !root) {
    // Membership was revoked — clear stale activeStoreId and re-route.
    // No need to filter session.memberships here; the /stores page queries
    // the DB directly and will show the user's real remaining stores.
    s.activeStoreId = undefined;
    await s.save();
    redirect('/stores');
  }

  // Root is a platform-scoped superuser and may cross into any existing store;
  // all other roles must use the active membership's database role.
  return { session: s, storeId, role: root ? 'ROOT_ADMIN' : dbRole!.role };
}

/**
 * Check the authoritative user row rather than trusting the cached session
 * claim. This is intentionally a DB lookup because root status is a global,
 * high-impact privilege that may be revoked while a session is still alive.
 */
export async function isRootUser(session: IronSession<SessionData>): Promise<boolean> {
  if (!session.userId) return false;
  return usersRepo.byId(session.userId)?.isRoot === 1;
}

export async function requireRoot(): Promise<IronSession<SessionData>> {
  const s = await requireUser();
  if (!(await isRootUser(s))) redirect('/stores');
  return s;
}

export function can(role: Role | undefined, perm: PermissionKey): boolean {
  return roleCan(role, perm);
}
export function canAny(role: Role | undefined, perms: PermissionKey[]): boolean {
  return roleCanAny(role, perms);
}
