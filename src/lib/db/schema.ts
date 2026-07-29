// SQLite schema — single source of truth for the local DB.
// Migrations are idempotent and tracked in the `meta` table.

import type { Database as DB } from 'better-sqlite3';

export type Migration = { id: string; /** A migration may also include a `check` function that returns
 true if the migration has already been applied (e.g. when adding a column). */ check?: (d: DB) => boolean; sql: string };

function hasColumn(d: DB, table: string, column: string): boolean {
  // We interpolate the table name into the SQL (table identifiers aren't
  // bind-able), so the prepared statement must NOT receive any bind params.
  const stmt = d.prepare(`PRAGMA table_info(${table})`);
  const rows = stmt.all() as Array<{ name: string }>;
  return rows.some((r) => r.name === column);
}

function hasIndex(d: DB, indexName: string): boolean {
  const stmt = d.prepare(`SELECT name FROM sqlite_master WHERE type='index' AND name = ?`);
  const rows = stmt.all(indexName) as Array<{ name: string }>;
  return rows.length > 0;
}

export const MIGRATIONS: Migration[] = [
  {
    id: '0001_initial',
    sql: `
      CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        passwordHash TEXT NOT NULL,
        isRoot INTEGER NOT NULL DEFAULT 0,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        deletedAt TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

      CREATE TABLE IF NOT EXISTS stores (
        id TEXT PRIMARY KEY,
        slug TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        currency TEXT NOT NULL DEFAULT 'USD',
        brandJson TEXT NOT NULL DEFAULT '{}',
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        deletedAt TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_stores_slug ON stores(slug);

      CREATE TABLE IF NOT EXISTS memberships (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        storeId TEXT NOT NULL,
        role TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 1,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        deletedAt TEXT,
        UNIQUE(userId, storeId),
        FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY(storeId) REFERENCES stores(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_memberships_user ON memberships(userId);
      CREATE INDEX IF NOT EXISTS idx_memberships_store ON memberships(storeId);

      CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        storeId TEXT NOT NULL,
        sku TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        costCents INTEGER NOT NULL DEFAULT 0,
        sellCents INTEGER NOT NULL DEFAULT 0,
        stockQty INTEGER NOT NULL DEFAULT 0,
        lowStockThreshold INTEGER NOT NULL DEFAULT 5,
        active INTEGER NOT NULL DEFAULT 1,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        deletedAt TEXT,
        UNIQUE(storeId, sku),
        FOREIGN KEY(storeId) REFERENCES stores(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_products_store ON products(storeId);
      CREATE INDEX IF NOT EXISTS idx_products_name ON products(storeId, name);

      CREATE TABLE IF NOT EXISTS customers (
        id TEXT PRIMARY KEY,
        storeId TEXT NOT NULL,
        name TEXT NOT NULL,
        phone TEXT NOT NULL DEFAULT '',
        email TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '',
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        deletedAt TEXT,
        FOREIGN KEY(storeId) REFERENCES stores(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_customers_store ON customers(storeId);

      CREATE TABLE IF NOT EXISTS sales (
        id TEXT PRIMARY KEY,
        storeId TEXT NOT NULL,
        customerId TEXT,
        cashierId TEXT NOT NULL,
        subtotalCents INTEGER NOT NULL,
        discountCents INTEGER NOT NULL DEFAULT 0,
        totalCents INTEGER NOT NULL,
        paymentMethod TEXT NOT NULL DEFAULT 'cash',
        receiptNumber TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'completed',
        note TEXT NOT NULL DEFAULT '',
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        deletedAt TEXT,
        FOREIGN KEY(storeId) REFERENCES stores(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_sales_store ON sales(storeId);
      CREATE INDEX IF NOT EXISTS idx_sales_created ON sales(storeId, createdAt);

      CREATE TABLE IF NOT EXISTS sale_items (
        id TEXT PRIMARY KEY,
        saleId TEXT NOT NULL,
        productId TEXT NOT NULL,
        productName TEXT NOT NULL,
        productSku TEXT NOT NULL,
        qty INTEGER NOT NULL,
        sellCentsSnapshot INTEGER NOT NULL,
        lineTotalCents INTEGER NOT NULL,
        FOREIGN KEY(saleId) REFERENCES sales(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(saleId);

      CREATE TABLE IF NOT EXISTS refunds (
        id TEXT PRIMARY KEY,
        storeId TEXT NOT NULL,
        saleId TEXT NOT NULL,
        cashierId TEXT NOT NULL,
        totalRefundCents INTEGER NOT NULL,
        reason TEXT NOT NULL DEFAULT '',
        createdAt TEXT NOT NULL,
        FOREIGN KEY(storeId) REFERENCES stores(id) ON DELETE CASCADE,
        FOREIGN KEY(saleId) REFERENCES sales(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_refunds_store ON refunds(storeId);
      CREATE INDEX IF NOT EXISTS idx_refunds_sale ON refunds(saleId);

      CREATE TABLE IF NOT EXISTS refund_items (
        id TEXT PRIMARY KEY,
        refundId TEXT NOT NULL,
        saleItemId TEXT NOT NULL,
        qty INTEGER NOT NULL,
        refundCents INTEGER NOT NULL,
        FOREIGN KEY(refundId) REFERENCES refunds(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_refund_items_refund ON refund_items(refundId);

      CREATE TABLE IF NOT EXISTS outbox (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        op TEXT NOT NULL,
        collection TEXT NOT NULL,
        docId TEXT NOT NULL,
        payloadJson TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        syncedAt TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_outbox_unsynced ON outbox(syncedAt);
    `,
  },
  {
    id: '0002_idempotency',
    // Idempotency keys: re-running the same checkout / refund request (e.g. a
    // retried POST) must yield the same persisted record, not a duplicate.
    //
    // Safe on existing schemas: `ALTER TABLE ... ADD COLUMN` fails if the column
    // is already there. We pre-check with `PRAGMA table_info` and skip the
    // ALTER (and the partial index creation) when not needed. The migration is
    // recorded in `meta` only after both schema changes succeed.
    check: (d) => hasColumn(d, 'sales', 'idempotencyKey') && hasColumn(d, 'refunds', 'idempotencyKey'),
    sql: `
      ALTER TABLE sales ADD COLUMN idempotencyKey TEXT;
      ALTER TABLE refunds ADD COLUMN idempotencyKey TEXT;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_idemp
        ON sales(storeId, idempotencyKey)
        WHERE idempotencyKey IS NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_refunds_idemp
        ON refunds(storeId, idempotencyKey)
        WHERE idempotencyKey IS NOT NULL;
    `,
  },
];

export { hasColumn, hasIndex };
