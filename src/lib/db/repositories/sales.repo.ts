// Sales repo (store-scoped). Atomic checkout + atomic refund (restock).
import { getDB } from '../sqlite';
import { nowISO, type Sale, type SaleItem, type PaymentMethod, type Refund, type RefundItem } from '../../types';
import { newId } from '../../ids';
import { writeTx } from './_tx';

export interface CartLine {
  productId: string;
  qty: number;
}

export interface CheckoutInput {
  storeId: string;
  cashierId: string;
  customerId: string | null;
  lines: CartLine[];
  paymentMethod?: PaymentMethod;
  discountCents?: number;
  note?: string;
  /** Optional idempotency key. Repeated requests with the same key
   *  short-circuit and return the previously persisted sale. */
  idempotencyKey?: string;
}

export interface CheckoutResult {
  sale: Sale;
  items: SaleItem[];
  receiptNumber: string;
}

export interface RefundLine {
  saleItemId: string;
  qty: number;
}

export interface RefundInput {
  storeId: string;
  saleId: string;
  cashierId: string;
  reason?: string;
  lines: RefundLine[];
  /** When omitted, refund ALL lines fully. */
  /** Idempotency key — repeated refund attempts with the same key
   *  return the previously persisted refund instead of double-refunding. */
  idempotencyKey?: string;
}

export const salesRepo = {
  /** All sales for a store (newest first). */
  list(storeId: string, limit = 100): Sale[] {
    return getDB()
      .prepare<[string, number], Sale>(
        `SELECT * FROM sales WHERE storeId = ? AND deletedAt IS NULL
         ORDER BY createdAt DESC LIMIT ?`,
      )
      .all(storeId, limit);
  },

  byId(storeId: string, id: string): Sale | undefined {
    return getDB()
      .prepare<[string, string], Sale>(
        'SELECT * FROM sales WHERE storeId = ? AND id = ? AND deletedAt IS NULL',
      )
      .get(storeId, id);
  },

  items(saleId: string): SaleItem[] {
    return getDB()
      .prepare<[string], SaleItem>(
        'SELECT * FROM sale_items WHERE saleId = ? ORDER BY rowid ASC',
      )
      .all(saleId);
  },

  refundsForSale(saleId: string): (Refund & { items: RefundItem[] })[] {
    const refunds = getDB()
      .prepare<[string], Refund>(
        'SELECT * FROM refunds WHERE saleId = ? ORDER BY createdAt ASC',
      )
      .all(saleId);
    return refunds.map((r) => ({
      ...r,
      items: getDB()
        .prepare<[string], RefundItem>('SELECT * FROM refund_items WHERE refundId = ?')
        .all(r.id),
    }));
  },

  /**
   * Atomic checkout: validates stock, decrements products, creates sale + items,
   * and emits outbox entries — all in one SQLite transaction.
   */
  checkout(input: CheckoutInput): CheckoutResult {
    if (input.lines.length === 0) throw new Error('Cart is empty');

    // Idempotency: if a prior run stored a result for this key, short-circuit
    // before mutating anything.
    if (input.idempotencyKey) {
      const existing = getDB()
        .prepare<[string, string], Sale>(
          `SELECT * FROM sales WHERE storeId = ? AND idempotencyKey = ? AND deletedAt IS NULL`,
        )
        .get(input.storeId, input.idempotencyKey);
      if (existing) {
        const items = getDB()
          .prepare<[string], SaleItem>(
            'SELECT * FROM sale_items WHERE saleId = ? ORDER BY rowid ASC',
          )
          .all(existing.id);
        return { sale: existing, items, receiptNumber: existing.receiptNumber };
      }
    }

    const saleId = newId();
    const now = nowISO();
    const receiptNumber = `R-${now.replace(/[:T.Z-]/g, '').slice(0, 12)}-${saleId.slice(-4).toUpperCase()}`;

    return writeTx((d) => {
      // Pass 1: validate each line, build the in-memory SaleItem list, and
      // compute the subtotal. We can't yet INSERT sale_items because the
      // sale_items.saleId FK references sales.id and the sale row doesn't
      // exist yet.
      const items: SaleItem[] = [];
      let subtotal = 0;
      const validatedLines: Array<{
        product: import('../../types').Product;
        nextQty: number;
        line: CartLine;
      }> = [];
      for (const line of input.lines) {
        const p = d
          .prepare<[string, string], import('../../types').Product>(
            `SELECT * FROM products WHERE storeId = ? AND id = ? AND deletedAt IS NULL`,
          )
          .get(input.storeId, line.productId);
        if (!p) throw new Error(`Product ${line.productId} not found`);
        if (!p.active) throw new Error(`Product ${p.name} is inactive`);
        const nextQty = p.stockQty - line.qty;
        if (nextQty < 0) throw new Error(`Insufficient stock for ${p.name}`);
        validatedLines.push({ product: p, nextQty, line });
        subtotal += p.sellCents * line.qty;
        items.push({
          id: newId(),
          saleId,
          productId: p.id,
          productName: p.name,
          productSku: p.sku,
          qty: line.qty,
          sellCentsSnapshot: p.sellCents,
          lineTotalCents: p.sellCents * line.qty,
        });
      }

      const discount = input.discountCents ?? 0;
      if (discount < 0 || discount > subtotal) throw new Error('Invalid discount');
      const total = subtotal - discount;

      // Pass 2: INSERT the sale FIRST so its id exists for the FK on
      // sale_items.saleId. (SQLite enforces FKs because we set
      // `foreign_keys = ON` in src/lib/db/sqlite.ts.)
      const sale: Sale = {
        id: saleId,
        storeId: input.storeId,
        customerId: input.customerId,
        cashierId: input.cashierId,
        subtotalCents: subtotal,
        discountCents: discount,
        totalCents: total,
        paymentMethod: input.paymentMethod ?? 'cash',
        receiptNumber,
        status: 'completed',
        note: input.note ?? '',
        idempotencyKey: input.idempotencyKey ?? null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      };
      d.prepare(
        `INSERT INTO sales(id,storeId,customerId,cashierId,subtotalCents,discountCents,totalCents,paymentMethod,receiptNumber,status,note,idempotencyKey,createdAt,updatedAt)
         VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      ).run(
        sale.id,
        sale.storeId,
        sale.customerId,
        sale.cashierId,
        sale.subtotalCents,
        sale.discountCents,
        sale.totalCents,
        sale.paymentMethod,
        sale.receiptNumber,
        sale.status,
        sale.note,
        sale.idempotencyKey,
        sale.createdAt,
        sale.updatedAt,
      );

      // Pass 3: decrement product stock and INSERT sale_items (FK on saleId
      // is now satisfied).
      const outbox: import('./_tx').OutboxEntry[] = [];
      outbox.push({ op: 'upsert', collection: 'Sale', docId: saleId, payload: sale });
      for (let i = 0; i < validatedLines.length; i++) {
        const { product: p, nextQty } = validatedLines[i]!;
        const it = items[i]!;
        d.prepare('UPDATE products SET stockQty=?, updatedAt=? WHERE id=?').run(
          nextQty,
          now,
          p.id,
        );
        outbox.push({
          op: 'upsert',
          collection: 'Product',
          docId: p.id,
          payload: { ...p, stockQty: nextQty, updatedAt: now },
        });
        d.prepare(
          `INSERT INTO sale_items(id,saleId,productId,productName,productSku,qty,sellCentsSnapshot,lineTotalCents)
           VALUES(?,?,?,?,?,?,?,?)`,
        ).run(
          it.id,
          it.saleId,
          it.productId,
          it.productName,
          it.productSku,
          it.qty,
          it.sellCentsSnapshot,
          it.lineTotalCents,
        );
        outbox.push({ op: 'upsert', collection: 'SaleItem', docId: it.id, payload: it });
      }

      return { result: { sale, items, receiptNumber }, outbox };
    });
  },

  /**
   * Atomic refund: restores stock, marks sale as '(partial_)refunded',
   * creates a Refund + RefundItems rows, emits outbox.
   *
   * Idempotency: if `idempotencyKey` is provided and a refund with the same
   * (storeId, idempotencyKey) exists, return that refund instead of
   * double-refunding.
   */
  refund(input: RefundInput): Refund {
    if (input.idempotencyKey) {
      const existing = getDB()
        .prepare<[string, string], Refund>(
          'SELECT * FROM refunds WHERE storeId = ? AND idempotencyKey = ?',
        )
        .get(input.storeId, input.idempotencyKey);
      if (existing) return existing;
    }
    return writeTx((d) => {
      const sale = d
        .prepare<[string, string], Sale>(
          'SELECT * FROM sales WHERE storeId=? AND id=? AND deletedAt IS NULL',
        )
        .get(input.storeId, input.saleId);
      if (!sale) throw new Error('Sale not found');

      const saleItems = d
        .prepare<[string], SaleItem>('SELECT * FROM sale_items WHERE saleId = ?')
        .all(input.saleId);

      const refundId = newId();
      const now = nowISO();
      let totalRefund = 0;
      const refundItems: RefundItem[] = [];
      const outbox: import('./_tx').OutboxEntry[] = [];

      for (const line of input.lines) {
        const si = saleItems.find((i) => i.id === line.saleItemId);
        if (!si) throw new Error(`Sale item ${line.saleItemId} not on this sale`);
        if (line.qty <= 0 || line.qty > si.qty) throw new Error('Invalid refund qty');
        const refundCents = line.qty * si.sellCentsSnapshot;
        totalRefund += refundCents;
        // restock
        const p = d
          .prepare<[string], import('../../types').Product>(
            'SELECT * FROM products WHERE id = ?',
          )
          .get(si.productId);
        if (p) {
          const nextQty = p.stockQty + line.qty;
          d.prepare('UPDATE products SET stockQty=?, updatedAt=? WHERE id=?').run(
            nextQty,
            now,
            p.id,
          );
          outbox.push({
            op: 'upsert',
            collection: 'Product',
            docId: p.id,
            payload: { ...p, stockQty: nextQty, updatedAt: now },
          });
        }
        const ri: RefundItem = {
          id: newId(),
          refundId,
          saleItemId: si.id,
          qty: line.qty,
          refundCents,
        };
        refundItems.push(ri);
        d.prepare(
          `INSERT INTO refund_items(id,refundId,saleItemId,qty,refundCents)
           VALUES(?,?,?,?,?)`,
        ).run(ri.id, ri.refundId, ri.saleItemId, ri.qty, ri.refundCents);
        outbox.push({ op: 'upsert', collection: 'RefundItem', docId: ri.id, payload: ri });
      }

      const refund: Refund = {
        id: refundId,
        storeId: input.storeId,
        saleId: input.saleId,
        cashierId: input.cashierId,
        totalRefundCents: totalRefund,
        reason: input.reason ?? '',
        idempotencyKey: input.idempotencyKey ?? null,
        createdAt: now,
      };
      d.prepare(
        `INSERT INTO refunds(id,storeId,saleId,cashierId,totalRefundCents,reason,idempotencyKey,createdAt)
         VALUES(?,?,?,?,?,?,?,?)`,
      ).run(
        refund.id,
        refund.storeId,
        refund.saleId,
        refund.cashierId,
        refund.totalRefundCents,
        refund.reason,
        refund.idempotencyKey,
        refund.createdAt,
      );
      outbox.push({ op: 'upsert', collection: 'Refund', docId: refundId, payload: refund });

      // Update sale status: mark refunded/partial_refund based on cumulative
      // refunded qty vs original sold qty per sale_item.
      const previouslyRefunded = new Map<string, number>();
      const priorRefundRows = d
        .prepare<[string], { id: string }>('SELECT id FROM refunds WHERE saleId = ?')
        .all(sale.id);
      for (const r of priorRefundRows) {
        const ritems = d
          .prepare<[string], { saleItemId: string; qty: number }>(
            'SELECT saleItemId, qty FROM refund_items WHERE refundId = ?',
          )
          .all(r.id);
        for (const ri of ritems) {
          previouslyRefunded.set(
            ri.saleItemId,
            (previouslyRefunded.get(ri.saleItemId) ?? 0) + ri.qty,
          );
        }
      }
      const thisRefundByItem = new Map<string, number>();
      for (const l of input.lines) thisRefundByItem.set(l.saleItemId, l.qty);

      let allFullyRefunded = true;
      for (const si of saleItems) {
        const total =
          (previouslyRefunded.get(si.id) ?? 0) + (thisRefundByItem.get(si.id) ?? 0);
        if (total < si.qty) {
          allFullyRefunded = false;
          break;
        }
      }
      const nextStatus: import('../../types').SaleStatus = allFullyRefunded
        ? 'refunded'
        : 'partial_refund';
      d.prepare('UPDATE sales SET status=?, updatedAt=? WHERE id=?').run(nextStatus, now, sale.id);
      outbox.push({
        op: 'upsert',
        collection: 'Sale',
        docId: sale.id,
        payload: { ...sale, status: nextStatus, updatedAt: now },
      });

      return { result: refund, outbox };
    });
  },

  /**
   * Aggregate for the daily cash-up report. Inclusive of dateStart.
   */
  dailySummary(storeId: string, date: Date): {
    count: number;
    totalCents: number;
    itemsCount: number;
    refundsCount: number;
    refundsCents: number;
    byPaymentMethod: Record<string, { count: number; cents: number }>;
  } {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);

    const sales = getDB()
      .prepare<[string, string, string], Sale>(
        `SELECT * FROM sales
         WHERE storeId = ? AND deletedAt IS NULL
           AND createdAt >= ? AND createdAt < ?
           AND status IN ('completed','partial_refund')`,
      )
      .all(storeId, start.toISOString(), end.toISOString());

    const itemsRow = getDB()
      .prepare<[string, string, string], { total: number | null }>(
        `SELECT SUM(si.qty) as total FROM sale_items si
         JOIN sales s ON s.id = si.saleId
         WHERE s.storeId = ? AND s.deletedAt IS NULL
           AND s.createdAt >= ? AND s.createdAt < ?
           AND s.status IN ('completed','partial_refund')`,
      )
      .get(storeId, start.toISOString(), end.toISOString());

    const refunds = getDB()
      .prepare<[string, string, string], Refund>(
        `SELECT * FROM refunds
         WHERE storeId = ? AND createdAt >= ? AND createdAt < ?`,
      )
      .all(storeId, start.toISOString(), end.toISOString());

    const byMethod: Record<string, { count: number; cents: number }> = {};
    let total = 0;
    for (const s of sales) {
      total += s.totalCents;
      const m = (byMethod[s.paymentMethod] ??= { count: 0, cents: 0 });
      m.count += 1;
      m.cents += s.totalCents;
    }
    return {
      count: sales.length,
      totalCents: total,
      itemsCount: itemsRow?.total ?? 0,
      refundsCount: refunds.length,
      refundsCents: refunds.reduce((a, r) => a + r.totalRefundCents, 0),
      byPaymentMethod: byMethod,
    };
  },

  /** 14-day time series (oldest first) for the dashboard chart. */
  dailyTimeSeries(storeId: string, days = 14): Array<{ date: string; cents: number; count: number }> {
    const out: Array<{ date: string; cents: number; count: number }> = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const start = d;
      const end = new Date(d);
      end.setDate(end.getDate() + 1);
      const rows = getDB()
        .prepare<[string, string, string], Sale>(
          `SELECT * FROM sales
           WHERE storeId = ? AND deletedAt IS NULL
             AND createdAt >= ? AND createdAt < ?
             AND status IN ('completed','partial_refund')`,
        )
        .all(storeId, start.toISOString(), end.toISOString());
      out.push({
        date: d.toISOString().slice(0, 10),
        cents: rows.reduce((a, s) => a + s.totalCents, 0),
        count: rows.length,
      });
    }
    return out;
  },

  /** Today's profit (root/manager only). */
  todaysProfit(storeId: string): { revenueCents: number; costCents: number; profitCents: number } {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    const rows = getDB()
      .prepare<[string, string, string], { productId: string; qty: number; sellCentsSnapshot: number; costCents: number }>(
        `SELECT si.productId, si.qty, si.sellCentsSnapshot, p.costCents
         FROM sale_items si
         JOIN sales s ON s.id = si.saleId
         JOIN products p ON p.id = si.productId
         WHERE s.storeId = ? AND s.deletedAt IS NULL
           AND s.createdAt >= ? AND s.createdAt < ?
           AND s.status IN ('completed','partial_refund')`,
      )
      .all(storeId, start.toISOString(), end.toISOString());
    let revenue = 0;
    let cost = 0;
    for (const r of rows) {
      revenue += r.qty * r.sellCentsSnapshot;
      cost += r.qty * r.costCents;
    }
    return { revenueCents: revenue, costCents: cost, profitCents: revenue - cost };
  },
};
