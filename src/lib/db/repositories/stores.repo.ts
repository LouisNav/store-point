// Stores repo — tenants.
import { getDB } from '../sqlite';
import { nowISO, type Store, type Brand } from '../../types';
import { newId } from '../../ids';
import { writeTx } from './_tx';

export interface CreateStoreInput {
  slug: string;
  name: string;
  currency?: string;
  brand?: Brand;
}

export const storesRepo = {
  list(): Store[] {
    return getDB()
      .prepare<[], Store>(
        'SELECT * FROM stores WHERE deletedAt IS NULL ORDER BY createdAt ASC',
      )
      .all();
  },

  byId(id: string): Store | undefined {
    return getDB()
      .prepare<[string], Store>(
        'SELECT * FROM stores WHERE id = ? AND deletedAt IS NULL',
      )
      .get(id);
  },

  bySlug(slug: string): Store | undefined {
    return getDB()
      .prepare<[string], Store>(
        'SELECT * FROM stores WHERE slug = ? AND deletedAt IS NULL',
      )
      .get(slug);
  },

  create(input: CreateStoreInput): Store {
    const id = newId();
    const now = nowISO();
    const store: Store = {
      id,
      slug: input.slug.toLowerCase().trim(),
      name: input.name,
      currency: input.currency ?? 'USD',
      brandJson: JSON.stringify(input.brand ?? {}),
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    writeTx((d) => {
      d.prepare(
        `INSERT INTO stores(id,slug,name,currency,brandJson,createdAt,updatedAt)
         VALUES(?,?,?,?,?,?,?)`,
      ).run(
        store.id,
        store.slug,
        store.name,
        store.currency,
        store.brandJson,
        store.createdAt,
        store.updatedAt,
      );
      return {
        result: store,
        outbox: [{ op: 'upsert', collection: 'Store', docId: store.id, payload: store }],
      };
    });
    return store;
  },

  update(id: string, patch: Partial<Pick<Store, 'name' | 'currency' | 'slug'>>): Store | undefined {
    return writeTx((d) => {
      const cur = d
        .prepare<[string], Store>('SELECT * FROM stores WHERE id = ?')
        .get(id);
      if (!cur) return { result: undefined, outbox: [] };
      const next: Store = { ...cur, ...patch, updatedAt: nowISO() };
      d.prepare('UPDATE stores SET name=?, currency=?, slug=?, updatedAt=? WHERE id = ?').run(
        next.name,
        next.currency,
        next.slug,
        next.updatedAt,
        id,
      );
      return {
        result: next,
        outbox: [{ op: 'upsert', collection: 'Store', docId: id, payload: next }],
      };
    });
  },

  updateBrand(id: string, brand: Brand): Store | undefined {
    return writeTx((d) => {
      const cur = d
        .prepare<[string], Store>('SELECT * FROM stores WHERE id = ?')
        .get(id);
      if (!cur) return { result: undefined, outbox: [] };
      const next: Store = { ...cur, brandJson: JSON.stringify(brand), updatedAt: nowISO() };
      d.prepare('UPDATE stores SET brandJson=?, updatedAt=? WHERE id = ?').run(next.brandJson, next.updatedAt, id);
      return {
        result: next,
        outbox: [{ op: 'upsert', collection: 'Store', docId: id, payload: next }],
      };
    });
  },
};

export function parseBrand(s: string): Brand {
  try {
    return JSON.parse(s) as Brand;
  } catch {
    return {};
  }
}
