// Bootstrap helpers — run from server actions/server components.
import { getDB } from '@/lib/db/sqlite';
import { usersRepo } from '@/lib/db/repositories/users.repo';

export async function hasAnyUser(): Promise<boolean> {
  // Defensive: even if seeding is concurrent, use COUNT.
  const row = getDB()
    .prepare<[], { count: number }>('SELECT COUNT(*) as count FROM users WHERE deletedAt IS NULL')
    .get();
  return (row?.count ?? 0) > 0;
}

export async function rootExists(): Promise<boolean> {
  const u = usersRepo.list();
  return u.some((x) => x.isRoot === 1);
}
