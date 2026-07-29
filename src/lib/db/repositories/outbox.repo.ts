// Outbox repo — drain helpers + status counts.
import { getDB } from '../sqlite';
import { nowISO, type OutboxRow } from '../../types';

export const outboxRepo = {
  pending(limit: number): OutboxRow[] {
    return getDB()
      .prepare<[number], OutboxRow>(
        `SELECT * FROM outbox WHERE syncedAt IS NULL ORDER BY id ASC LIMIT ?`,
      )
      .all(limit);
  },

  markSynced(id: number): void {
    getDB()
      .prepare('UPDATE outbox SET syncedAt = ? WHERE id = ?')
      .run(nowISO(), id);
  },

  pendingCount(): number {
    const row = getDB()
      .prepare<[], { count: number }>('SELECT COUNT(*) as count FROM outbox WHERE syncedAt IS NULL')
      .get();
    return row?.count ?? 0;
  },

  totalCount(): number {
    const row = getDB()
      .prepare<[], { count: number }>('SELECT COUNT(*) as count FROM outbox')
      .get();
    return row?.count ?? 0;
  },
};
