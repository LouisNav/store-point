// Products repo (store-scoped).
import { getDB } from '../sqlite';
import { nowISO, type InventoryAudit, type Product } from '../../types';
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
        sku: patch.sku ?? cur.sku,
        name: patch.name ?? cur.name,
        description: patch.description ?? cur.description,
        costCents: patch.costCents ?? cur.costCents,
        sellCents: patch.sellCents ?? cur.sellCents,
        // Stock is intentionally excluded: inventory movements must use adjustStock().
        lowStockThreshold: patch.lowStockThreshold ?? cur.lowStockThreshold,
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
   * Atomically adjust stock by a delta and append an immutable, reasoned audit event.
   * Throws if it would go negative or the reason is missing.
   */
  adjustStock(storeId: string, id: string, delta: number, reason: string, actorId: string): Product | undefined {
    return writeTx((d) => {
      const member = d.prepare<[string, string], { userId: string }>(
        'SELECT userId FROM memberships WHERE storeId=? AND userId=? AND active=1 AND deletedAt IS NULL',
      ).get(storeId, actorId);
      if (!member) throw new Error('User is not an active member of this store.');
      const cur = d
        .prepare<[string, string], Product>(
          'SELECT * FROM products WHERE storeId=? AND id=? AND deletedAt IS NULL',
        )
        .get(storeId, id);
      if (!cur) return { result: undefined, outbox: [] };
      const cleanReason = reason.trim();
      if (!cleanReason) throw new Error('A reason is required for every stock adjustment.');
      if (!Number.isInteger(delta) || delta === 0) throw new Error('Stock adjustment must be a non-zero whole number.');
      const nextQty = cur.stockQty + delta;
      if (nextQty < 0) throw new Error(`Insufficient stock for ${cur.name}`);
      const now = nowISO();
      const next: Product = { ...cur, stockQty: nextQty, updatedAt: now };
      d.prepare('UPDATE products SET stockQty=?, updatedAt=? WHERE id=?').run(next.stockQty, next.updatedAt, id);
      const audit: InventoryAudit = {
        id: newId(),
        storeId,
        productId: id,
        actorId,
        delta,
        beforeQty: cur.stockQty,
        afterQty: nextQty,
        reason: cleanReason,
        createdAt: now,
      };
      d.prepare(
        `INSERT INTO inventory_audit(id,storeId,productId,actorId,delta,beforeQty,afterQty,reason,createdAt)
         VALUES(?,?,?,?,?,?,?,?,?)`,
      ).run(audit.id, audit.storeId, audit.productId, audit.actorId, audit.delta, audit.beforeQty, audit.afterQty, audit.reason, audit.createdAt);
      return {
        result: next,
        outbox: [
          { op: 'upsert', collection: 'Product', docId: id, payload: next },
          { op: 'upsert', collection: 'InventoryAudit', docId: audit.id, payload: audit },
        ],
      };
    });
  },

  inventoryAudit(storeId: string, productId?: string, limit = 100): InventoryAudit[] {
    const capped = Math.min(Math.max(limit, 1), 500);
    return productId
      ? getDB().prepare<[string, string, number], InventoryAudit>(
          'SELECT * FROM inventory_audit WHERE storeId=? AND productId=? ORDER BY createdAt DESC LIMIT ?',
        ).all(storeId, productId, capped)
      : getDB().prepare<[string, number], InventoryAudit>(
          'SELECT * FROM inventory_audit WHERE storeId=? ORDER BY createdAt DESC LIMIT ?',
        ).all(storeId, capped);
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
