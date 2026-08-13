// Memberships repo.
import { getDB } from '../sqlite';
import { nowISO, type Membership, type Role } from '../../types';
import { newId } from '../../ids';
import { writeTx } from './_tx';

export const membershipsRepo = {
  forUser(userId: string): Membership[] {
    return getDB()
      .prepare<[string], Membership>(
        `SELECT * FROM memberships WHERE userId = ? AND active = 1 AND deletedAt IS NULL ORDER BY createdAt ASC`,
      )
      .all(userId);
  },

  forStore(storeId: string): Membership[] {
    return getDB()
      .prepare<[string], Membership>(
        `SELECT * FROM memberships WHERE storeId = ? AND deletedAt IS NULL AND active = 1 ORDER BY createdAt ASC`,
      )
      .all(storeId);
  },

  activeRole(userId: string, storeId: string): Membership | undefined {
    return getDB()
      .prepare<[string, string], Membership>(
        `SELECT * FROM memberships
         WHERE userId = ? AND storeId = ? AND deletedAt IS NULL AND active = 1 LIMIT 1`,
      )
      .get(userId, storeId);
  },

  upsert(userId: string, storeId: string, role: Role): Membership {
    return writeTx((d) => {
      const existing = d
        .prepare<[string, string], Membership>(
          'SELECT * FROM memberships WHERE userId=? AND storeId=? AND deletedAt IS NULL',
        )
        .get(userId, storeId);
      if (existing) {
        const next: Membership = {
          ...existing,
          role,
          active: 1,
          updatedAt: nowISO(),
        };
        d.prepare('UPDATE memberships SET role=?, active=1, updatedAt=? WHERE id=?').run(
          next.role,
          next.updatedAt,
          existing.id,
        );
        return {
          result: next,
          outbox: [
            { op: 'upsert', collection: 'Membership', docId: existing.id, payload: next },
          ],
        };
      }
      const m: Membership = {
        id: newId(),
        userId,
        storeId,
        role,
        active: 1,
        createdAt: nowISO(),
        updatedAt: nowISO(),
        deletedAt: null,
      };
      d.prepare(
        `INSERT INTO memberships(id,userId,storeId,role,active,createdAt,updatedAt)
         VALUES(?,?,?,?,?,?,?)`,
      ).run(m.id, m.userId, m.storeId, m.role, m.active, m.createdAt, m.updatedAt);
      return {
        result: m,
        outbox: [{ op: 'upsert', collection: 'Membership', docId: m.id, payload: m }],
      };
    });
  },

  setActive(id: string, active: boolean): void {
    writeTx((d) => {
      d.prepare('UPDATE memberships SET active=?, updatedAt=? WHERE id=?').run(
        active ? 1 : 0,
        nowISO(),
        id,
      );
      const cur = d
        .prepare<[string], Membership>('SELECT * FROM memberships WHERE id=?')
        .get(id);
      if (!cur) return { result: undefined, outbox: [] };
      return {
        result: cur,
        outbox: [{ op: 'upsert', collection: 'Membership', docId: id, payload: cur }],
      };
    });
  },

  softDelete(id: string): void {
    writeTx((d) => {
      d.prepare('UPDATE memberships SET deletedAt=?, updatedAt=? WHERE id=?').run(
        nowISO(),
        nowISO(),
        id,
      );
      const cur = d
        .prepare<[string], Membership>('SELECT * FROM memberships WHERE id=?')
        .get(id);
      if (!cur) return { result: undefined, outbox: [] };
      return {
        result: cur,
        outbox: [
          {
            op: 'soft_delete',
            collection: 'Membership',
            docId: id,
            payload: { ...cur, deletedAt: nowISO() },
          },
        ],
      };
    });
  },
};
