// Customers repo (store-scoped).
import { getDB } from '../sqlite';
import { nowISO, type Customer } from '../../types';
import { newId } from '../../ids';
import { writeTx } from './_tx';

export interface CreateCustomerInput {
  name: string;
  phone?: string;
  email?: string;
  notes?: string;
}

export const customersRepo = {
  list(storeId: string): Customer[] {
    return getDB()
      .prepare<[string], Customer>(
        `SELECT * FROM customers WHERE storeId = ? AND deletedAt IS NULL
         ORDER BY name COLLATE NOCASE ASC`,
      )
      .all(storeId);
  },

  byId(storeId: string, id: string): Customer | undefined {
    return getDB()
      .prepare<[string, string], Customer>(
        'SELECT * FROM customers WHERE storeId = ? AND id = ? AND deletedAt IS NULL',
      )
      .get(storeId, id);
  },

  create(storeId: string, input: CreateCustomerInput): Customer {
    return writeTx((d) => {
      const c: Customer = {
        id: newId(),
        storeId,
        name: input.name,
        phone: input.phone ?? '',
        email: input.email ?? '',
        notes: input.notes ?? '',
        createdAt: nowISO(),
        updatedAt: nowISO(),
        deletedAt: null,
      };
      d.prepare(
        `INSERT INTO customers(id,storeId,name,phone,email,notes,createdAt,updatedAt)
         VALUES(?,?,?,?,?,?,?,?)`,
      ).run(c.id, c.storeId, c.name, c.phone, c.email, c.notes, c.createdAt, c.updatedAt);
      return {
        result: c,
        outbox: [{ op: 'upsert', collection: 'Customer', docId: c.id, payload: c }],
      };
    });
  },

  update(storeId: string, id: string, patch: Partial<Omit<Customer, 'id' | 'storeId'>>): Customer | undefined {
    return writeTx((d) => {
      const cur = d
        .prepare<[string, string], Customer>(
          'SELECT * FROM customers WHERE storeId=? AND id=? AND deletedAt IS NULL',
        )
        .get(storeId, id);
      if (!cur) return { result: undefined, outbox: [] };
      const next: Customer = { ...cur, ...patch, updatedAt: nowISO() };
      d.prepare(
        'UPDATE customers SET name=?, phone=?, email=?, notes=?, updatedAt=? WHERE id=?',
      ).run(next.name, next.phone, next.email, next.notes, next.updatedAt, id);
      return {
        result: next,
        outbox: [{ op: 'upsert', collection: 'Customer', docId: id, payload: next }],
      };
    });
  },
};
