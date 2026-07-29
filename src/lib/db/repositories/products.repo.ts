// Products repo (store-scoped).
import { getDB } from '../sqlite';
import { nowISO, type Product } from '../../types';
import { newId } from '../../ids';
import { writeTx } from './_tx';

export interface CreateProductInput {
  sku: string;
  name: string;
  description?: string;
  costCents: number;
  sellCents: number;
  stockQty: number;
  lowStockThreshold?: number;
  active?: boolean;
}

export interface UpdateProductInput {
  sku?: string;
  name?: string;
  description?: string;
  costCents?: number;
  sellCents?: number;
  stockQty?: number;
  lowStockThreshold?: number;
  active?: boolean;
}

export const productsRepo = {
  list(storeId: string): Product[] {
    return getDB()
      .prepare<[string], Product>(
        `SELECT * FROM products WHERE storeId = ? AND deletedAt IS NULL
         ORDER BY active DESC, name COLLATE NOCASE ASC`,
      )
      .all(storeId);
  },

  search(storeId: string, query: string, limit = 20): Product[] {
    const q = `%${query.toLowerCase()}%`;
    return getDB()
      .prepare<[string, string, string, string, number], Product>(
        `SELECT * FROM products
         WHERE storeId = ? AND deletedAt IS NULL AND active = 1
           AND (LOWER(name) LIKE ? OR LOWER(sku) LIKE ? OR LOWER(description) LIKE ?)
         ORDER BY name ASC LIMIT ?`,
      )
      .all(storeId, q, q, q, limit);
  },

  byId(storeId: string, id: string): Product | undefined {
    return getDB()
      .prepare<[string, string], Product>(
        'SELECT * FROM products WHERE storeId = ? AND id = ? AND deletedAt IS NULL',
      )
      .get(storeId, id);
  },

  lowStock(storeId: string, limit = 10): Product[] {
    return getDB()
      .prepare<[string, number], Product>(
        `SELECT * FROM products
         WHERE storeId = ? AND deletedAt IS NULL AND active = 1
           AND stockQty <= lowStockThreshold
         ORDER BY stockQty ASC LIMIT ?`,
      )
      .all(storeId, limit);
  },

  create(storeId: string, input: CreateProductInput): Product {
    return writeTx((d) => {
      const id = newId();
      const now = nowISO();
      const p: Product = {
        id,
        storeId,
        sku: input.sku.trim(),
        name: input.name.trim(),
        description: input.description ?? '',
        costCents: input.costCents,
        sellCents: input.sellCents,
        stockQty: input.stockQty,
        lowStockThreshold: input.lowStockThreshold ?? 5,
        active: input.active === false ? 0 : 1,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      };
      d.prepare(
        `INSERT INTO products(id,storeId,sku,name,description,costCents,sellCents,stockQty,lowStockThreshold,active,createdAt,updatedAt)
         VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
      ).run(
        p.id,
        p.storeId,
        p.sku,
        p.name,
        p.description,
        p.costCents,
        p.sellCents,
        p.stockQty,
        p.lowStockThreshold,
        p.active,
        p.createdAt,
        p.updatedAt,
      );
      return {
        result: p,
        outbox: [{ op: 'upsert', collection: 'Product', docId: p.id, payload: p }],
      };
    });
  },

  update(storeId: string, id: string, patch: UpdateProductInput): Product | undefined {
    return writeTx((d) => {
      const cur = d
        .prepare<[string, string], Product>(
          'SELECT * FROM products WHERE storeId=? AND id=? AND deletedAt IS NULL',
        )
        .get(storeId, id);
      if (!cur) return { result: undefined, outbox: [] };
      const next: Product = {
        ...cur,
        ...patch,
        active: patch.active === undefined ? cur.active : patch.active ? 1 : 0,
        updatedAt: nowISO(),
      };
      d.prepare(
        `UPDATE products
         SET sku=?, name=?, description=?, costCents=?, sellCents=?, stockQty=?, lowStockThreshold=?, active=?, updatedAt=?
         WHERE id=?`,
      ).run(
        next.sku,
        next.name,
        next.description,
        next.costCents,
        next.sellCents,
        next.stockQty,
        next.lowStockThreshold,
        next.active,
        next.updatedAt,
        id,
      );
      return {
        result: next,
        outbox: [{ op: 'upsert', collection: 'Product', docId: id, payload: next }],
      };
    });
  },

  /**
   * Atomically adjust stock by a delta (positive or negative).
   * Throws if it would go negative.
   */
  adjustStock(storeId: string, id: string, delta: number): Product | undefined {
    return writeTx((d) => {
      const cur = d
        .prepare<[string, string], Product>(
          'SELECT * FROM products WHERE storeId=? AND id=? AND deletedAt IS NULL',
        )
        .get(storeId, id);
      if (!cur) return { result: undefined, outbox: [] };
      const nextQty = cur.stockQty + delta;
      if (nextQty < 0) throw new Error(`Insufficient stock for ${cur.name}`);
      const next: Product = { ...cur, stockQty: nextQty, updatedAt: nowISO() };
      d.prepare('UPDATE products SET stockQty=?, updatedAt=? WHERE id=?').run(
        next.stockQty,
        next.updatedAt,
        id,
      );
      return {
        result: next,
        outbox: [{ op: 'upsert', collection: 'Product', docId: id, payload: next }],
      };
    });
  },

  softDelete(storeId: string, id: string): void {
    writeTx((d) => {
      d.prepare(
        'UPDATE products SET deletedAt=?, updatedAt=? WHERE storeId=? AND id=?',
      ).run(nowISO(), nowISO(), storeId, id);
      return {
        result: undefined,
        outbox: [
          {
            op: 'soft_delete',
            collection: 'Product',
            docId: id,
            payload: { id, storeId, deletedAt: nowISO() },
          },
        ],
      };
    });
  },
};
