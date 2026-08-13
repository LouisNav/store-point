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

function hasTable(d: DB, tableName: string): boolean {
  const row = d.prepare<[string], { name: string }>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name = ?",
  ).get(tableName);
  return !!row;
}

function hasIndex(d: DB, indexName: string): boolean {
  const stmt = d.prepare(`SELECT name FROM sqlite_master WHERE type='index' AND name = ?`);
  const rows = stmt.all(indexName) as Array<{ name: string }>;
  return rows.length > 0;
}

function hasTrigger(d: DB, triggerName: string): boolean {
  const row = d.prepare<[string], { name: string }>(
    "SELECT name FROM sqlite_master WHERE type='trigger' AND name = ?",
  ).get(triggerName);
  return !!row;
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
    id: '0003_messaging',
    sql: `
      CREATE TABLE IF NOT EXISTS channels (
        id TEXT PRIMARY KEY,
        storeId TEXT NOT NULL,
        slug TEXT NOT NULL,
        directKey TEXT,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        kind TEXT NOT NULL DEFAULT 'general',
        createdById TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        deletedAt TEXT,
        UNIQUE(storeId, slug),
        FOREIGN KEY(storeId) REFERENCES stores(id) ON DELETE CASCADE,
        FOREIGN KEY(createdById) REFERENCES users(id)
      );
      CREATE INDEX IF NOT EXISTS idx_channels_store ON channels(storeId, createdAt);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_channels_direct_key ON channels(storeId, directKey) WHERE directKey IS NOT NULL;

      CREATE TABLE IF NOT EXISTS channel_participants (
        channelId TEXT NOT NULL,
        storeId TEXT NOT NULL,
        userId TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        PRIMARY KEY(channelId, userId),
        FOREIGN KEY(channelId) REFERENCES channels(id) ON DELETE CASCADE,
        FOREIGN KEY(storeId) REFERENCES stores(id) ON DELETE CASCADE,
        FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_channel_participants_user ON channel_participants(storeId, userId);

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        storeId TEXT NOT NULL,
        channelId TEXT NOT NULL,
        authorId TEXT NOT NULL,
        parentId TEXT,
        body TEXT NOT NULL,
        reactionsJson TEXT NOT NULL DEFAULT '{}',
        pinned INTEGER NOT NULL DEFAULT 0,
        requiresAck INTEGER NOT NULL DEFAULT 0,
        editedAt TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        deletedAt TEXT,
        FOREIGN KEY(storeId) REFERENCES stores(id) ON DELETE CASCADE,
        FOREIGN KEY(channelId) REFERENCES channels(id) ON DELETE CASCADE,
        FOREIGN KEY(authorId) REFERENCES users(id)
      );
      CREATE INDEX IF NOT EXISTS idx_messages_channel_created ON messages(channelId, createdAt);
      CREATE INDEX IF NOT EXISTS idx_messages_store_created ON messages(storeId, createdAt);
      CREATE INDEX IF NOT EXISTS idx_messages_parent ON messages(parentId);

      CREATE TABLE IF NOT EXISTS channel_reads (
        channelId TEXT NOT NULL,
        userId TEXT NOT NULL,
        lastReadAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        PRIMARY KEY(channelId, userId),
        FOREIGN KEY(channelId) REFERENCES channels(id) ON DELETE CASCADE,
        FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS message_acknowledgments (
        messageId TEXT NOT NULL,
        userId TEXT NOT NULL,
        acknowledgedAt TEXT NOT NULL,
        PRIMARY KEY(messageId, userId),
        FOREIGN KEY(messageId) REFERENCES messages(id) ON DELETE CASCADE,
        FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_message_acks_message ON message_acknowledgments(messageId);

      CREATE TABLE IF NOT EXISTS message_audit (
        id TEXT PRIMARY KEY,
        storeId TEXT NOT NULL,
        messageId TEXT,
        channelId TEXT,
        actorId TEXT NOT NULL,
        action TEXT NOT NULL,
        metadataJson TEXT NOT NULL DEFAULT '{}',
        createdAt TEXT NOT NULL,
        FOREIGN KEY(storeId) REFERENCES stores(id) ON DELETE CASCADE,
        FOREIGN KEY(messageId) REFERENCES messages(id) ON DELETE SET NULL,
        FOREIGN KEY(channelId) REFERENCES channels(id) ON DELETE SET NULL,
        FOREIGN KEY(actorId) REFERENCES users(id)
      );
      CREATE INDEX IF NOT EXISTS idx_message_audit_store_created ON message_audit(storeId, createdAt);
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
    check: (d) => hasColumn(d, 'sales', 'idempotencyKey')
      && hasColumn(d, 'refunds', 'idempotencyKey')
      && hasIndex(d, 'idx_sales_idemp')
      && hasIndex(d, 'idx_refunds_idemp'),
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
  {
    id: '0004_direct_messaging',
    // Direct conversations are participant-scoped channels. The directKey
    // index guarantees one stable conversation per pair inside a store.
    check: (d) => hasColumn(d, 'channels', 'directKey')
      && hasTable(d, 'channel_participants')
      && hasIndex(d, 'idx_channels_direct_key')
      && hasIndex(d, 'idx_channel_participants_user'),
    sql: `
      ALTER TABLE channels ADD COLUMN directKey TEXT;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_channels_direct_key ON channels(storeId, directKey) WHERE directKey IS NOT NULL;
      CREATE TABLE IF NOT EXISTS channel_participants (
        channelId TEXT NOT NULL,
        storeId TEXT NOT NULL,
        userId TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        PRIMARY KEY(channelId, userId),
        FOREIGN KEY(channelId) REFERENCES channels(id) ON DELETE CASCADE,
        FOREIGN KEY(storeId) REFERENCES stores(id) ON DELETE CASCADE,
        FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_channel_participants_user ON channel_participants(storeId, userId);
    `,
  },
  {
    id: '0005_messaging_governance',
    check: (d) => {
      if (!hasTable(d, 'message_revisions') || !hasIndex(d, 'idx_message_revisions_message')) return false;
      const revisionCount = d.prepare<[], { count: number }>('SELECT COUNT(*) AS count FROM message_revisions').get()?.count ?? 0;
      const messageCount = d.prepare<[], { count: number }>('SELECT COUNT(*) AS count FROM messages').get()?.count ?? 0;
      return revisionCount >= messageCount
        && hasTrigger(d, 'prevent_message_audit_update')
        && hasTrigger(d, 'prevent_message_audit_delete')
        && hasTrigger(d, 'prevent_message_revision_update')
        && hasTrigger(d, 'prevent_message_revision_delete')
        && hasTrigger(d, 'validate_channel_participant_store_insert')
        && hasTrigger(d, 'validate_channel_participant_store_update');
    },
    sql: `
      CREATE TABLE IF NOT EXISTS message_revisions (
        id TEXT PRIMARY KEY,
        storeId TEXT NOT NULL,
        messageId TEXT NOT NULL,
        version INTEGER NOT NULL,
        body TEXT NOT NULL,
        revisedById TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        UNIQUE(messageId, version),
        FOREIGN KEY(storeId) REFERENCES stores(id) ON DELETE CASCADE,
        FOREIGN KEY(messageId) REFERENCES messages(id) ON DELETE CASCADE,
        FOREIGN KEY(revisedById) REFERENCES users(id)
      );
      CREATE INDEX IF NOT EXISTS idx_message_revisions_message ON message_revisions(messageId, version);
      INSERT OR IGNORE INTO message_revisions(id,storeId,messageId,version,body,revisedById,createdAt)
        SELECT id || ':v1', storeId, id, 1, body, authorId, createdAt FROM messages;
      INSERT INTO outbox(op,collection,docId,payloadJson,createdAt)
        SELECT 'upsert', 'MessageRevision', r.id,
          json_object('id', r.id, 'storeId', r.storeId, 'messageId', r.messageId, 'version', r.version, 'body', r.body, 'revisedById', r.revisedById, 'createdAt', r.createdAt),
          r.createdAt
        FROM message_revisions r
        WHERE NOT EXISTS (SELECT 1 FROM outbox o WHERE o.collection='MessageRevision' AND o.docId=r.id);

      CREATE TRIGGER IF NOT EXISTS prevent_message_audit_update
      BEFORE UPDATE ON message_audit
      BEGIN
        SELECT RAISE(ABORT, 'message audit is append-only');
      END;
      CREATE TRIGGER IF NOT EXISTS prevent_message_audit_delete
      BEFORE DELETE ON message_audit
      BEGIN
        SELECT RAISE(ABORT, 'message audit is append-only');
      END;
      CREATE TRIGGER IF NOT EXISTS prevent_message_revision_update
      BEFORE UPDATE ON message_revisions
      BEGIN
        SELECT RAISE(ABORT, 'message revisions are append-only');
      END;
      CREATE TRIGGER IF NOT EXISTS prevent_message_revision_delete
      BEFORE DELETE ON message_revisions
      BEGIN
        SELECT RAISE(ABORT, 'message revisions are append-only');
      END;
      CREATE TRIGGER IF NOT EXISTS validate_channel_participant_store_insert
      BEFORE INSERT ON channel_participants
      WHEN NOT EXISTS (SELECT 1 FROM channels WHERE id=NEW.channelId AND storeId=NEW.storeId)
      BEGIN
        SELECT RAISE(ABORT, 'channel participant store mismatch');
      END;
      CREATE TRIGGER IF NOT EXISTS validate_channel_participant_store_update
      BEFORE UPDATE OF channelId,storeId ON channel_participants
      WHEN NOT EXISTS (SELECT 1 FROM channels WHERE id=NEW.channelId AND storeId=NEW.storeId)
      BEGIN
        SELECT RAISE(ABORT, 'channel participant store mismatch');
      END;
    `,
  },
  {
    id: '0006_inventory_audit',
    check: (d) => hasTable(d, 'inventory_audit')
      && ['storeId', 'productId', 'actorId', 'delta', 'beforeQty', 'afterQty', 'reason', 'createdAt'].every((column) => hasColumn(d, 'inventory_audit', column))
      && hasIndex(d, 'idx_inventory_audit_store_created')
      && hasIndex(d, 'idx_inventory_audit_product_created')
      && hasTrigger(d, 'prevent_inventory_audit_update')
      && hasTrigger(d, 'prevent_inventory_audit_delete'),
    sql: `
      CREATE TABLE IF NOT EXISTS inventory_audit (
        id TEXT PRIMARY KEY,
        storeId TEXT NOT NULL,
        productId TEXT NOT NULL,
        actorId TEXT NOT NULL,
        delta INTEGER NOT NULL,
        beforeQty INTEGER NOT NULL,
        afterQty INTEGER NOT NULL,
        reason TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        FOREIGN KEY(storeId) REFERENCES stores(id) ON DELETE CASCADE,
        FOREIGN KEY(productId) REFERENCES products(id) ON DELETE SET NULL,
        FOREIGN KEY(actorId) REFERENCES users(id)
      );
      CREATE INDEX IF NOT EXISTS idx_inventory_audit_store_created ON inventory_audit(storeId, createdAt);
      CREATE INDEX IF NOT EXISTS idx_inventory_audit_product_created ON inventory_audit(productId, createdAt);
      CREATE TRIGGER IF NOT EXISTS prevent_inventory_audit_update
      BEFORE UPDATE ON inventory_audit
      BEGIN
        SELECT RAISE(ABORT, 'inventory audit is append-only');
      END;
      CREATE TRIGGER IF NOT EXISTS prevent_inventory_audit_delete
      BEFORE DELETE ON inventory_audit
      BEGIN
        SELECT RAISE(ABORT, 'inventory audit is append-only');
      END;
    `,
  },
  {
    id: '0007_global_announcements',
    check: (d) => hasTable(d, 'global_announcements')
      && hasTable(d, 'global_announcement_acknowledgments')
      && hasTable(d, 'global_announcement_audit')
      && hasIndex(d, 'idx_global_announcements_active')
      && hasIndex(d, 'idx_global_announcement_acks_announcement')
      && hasIndex(d, 'idx_global_announcement_audit_created')
      && hasTrigger(d, 'prevent_global_announcement_ack_update')
      && hasTrigger(d, 'prevent_global_announcement_ack_delete')
      && hasTrigger(d, 'prevent_global_announcement_audit_update')
      && hasTrigger(d, 'prevent_global_announcement_audit_delete'),
    sql: `
      CREATE TABLE IF NOT EXISTS global_announcements (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        priority TEXT NOT NULL DEFAULT 'normal',
        requiresAck INTEGER NOT NULL DEFAULT 0,
        createdById TEXT NOT NULL,
        publishedAt TEXT NOT NULL,
        expiresAt TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        deletedAt TEXT,
        FOREIGN KEY(createdById) REFERENCES users(id)
      );
      CREATE INDEX IF NOT EXISTS idx_global_announcements_active ON global_announcements(publishedAt, expiresAt, deletedAt);

      CREATE TABLE IF NOT EXISTS global_announcement_acknowledgments (
        announcementId TEXT NOT NULL,
        userId TEXT NOT NULL,
        storeId TEXT NOT NULL,
        acknowledgedAt TEXT NOT NULL,
        PRIMARY KEY(announcementId, userId),
        FOREIGN KEY(announcementId) REFERENCES global_announcements(id) ON DELETE CASCADE,
        FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY(storeId) REFERENCES stores(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_global_announcement_acks_announcement ON global_announcement_acknowledgments(announcementId);
      CREATE TRIGGER IF NOT EXISTS prevent_global_announcement_ack_update
      BEFORE UPDATE ON global_announcement_acknowledgments
      BEGIN
        SELECT RAISE(ABORT, 'global announcement acknowledgments are append-only');
      END;
      CREATE TRIGGER IF NOT EXISTS prevent_global_announcement_ack_delete
      BEFORE DELETE ON global_announcement_acknowledgments
      BEGIN
        SELECT RAISE(ABORT, 'global announcement acknowledgments are append-only');
      END;

      CREATE TABLE IF NOT EXISTS global_announcement_audit (
        id TEXT PRIMARY KEY,
        announcementId TEXT,
        actorId TEXT NOT NULL,
        action TEXT NOT NULL,
        metadataJson TEXT NOT NULL DEFAULT '{}',
        createdAt TEXT NOT NULL,
        FOREIGN KEY(announcementId) REFERENCES global_announcements(id) ON DELETE SET NULL,
        FOREIGN KEY(actorId) REFERENCES users(id)
      );
      CREATE INDEX IF NOT EXISTS idx_global_announcement_audit_created ON global_announcement_audit(createdAt);
      CREATE TRIGGER IF NOT EXISTS prevent_global_announcement_audit_update
      BEFORE UPDATE ON global_announcement_audit
      BEGIN
        SELECT RAISE(ABORT, 'global announcement audit is append-only');
      END;
      CREATE TRIGGER IF NOT EXISTS prevent_global_announcement_audit_delete
      BEFORE DELETE ON global_announcement_audit
      BEGIN
        SELECT RAISE(ABORT, 'global announcement audit is append-only');
      END;
    `,
  },
  {
    id: '0008_audit_events',
    check: (d) => hasTable(d, 'audit_events')
      && ['storeId', 'actorId', 'actorEmail', 'action', 'entityType', 'entityId', 'metadataJson', 'ip', 'createdAt'].every((column) => hasColumn(d, 'audit_events', column))
      && hasIndex(d, 'idx_audit_events_store_created')
      && hasIndex(d, 'idx_audit_events_actor_created')
      && hasIndex(d, 'idx_audit_events_action_created')
      && hasTrigger(d, 'prevent_audit_events_update')
      && hasTrigger(d, 'prevent_audit_events_delete'),
    sql: `
      CREATE TABLE IF NOT EXISTS audit_events (
        id TEXT PRIMARY KEY,
        storeId TEXT,
        actorId TEXT,
        actorEmail TEXT,
        action TEXT NOT NULL,
        entityType TEXT,
        entityId TEXT,
        metadataJson TEXT NOT NULL DEFAULT '{}',
        ip TEXT,
        createdAt TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_audit_events_store_created ON audit_events(storeId, createdAt);
      CREATE INDEX IF NOT EXISTS idx_audit_events_actor_created ON audit_events(actorId, createdAt);
      CREATE INDEX IF NOT EXISTS idx_audit_events_action_created ON audit_events(action, createdAt);
      CREATE TRIGGER IF NOT EXISTS prevent_audit_events_update
      BEFORE UPDATE ON audit_events
      BEGIN
        SELECT RAISE(ABORT, 'audit events are append-only');
      END;
      CREATE TRIGGER IF NOT EXISTS prevent_audit_events_delete
      BEFORE DELETE ON audit_events
      BEGIN
        SELECT RAISE(ABORT, 'audit events are append-only');
      END;
    `,
  },
  {
    id: '0009_rate_limits',
    check: (d) => hasTable(d, 'rate_limit_hits')
      && hasIndex(d, 'idx_rate_limit_hits_key_created'),
    sql: `
      CREATE TABLE IF NOT EXISTS rate_limit_hits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT NOT NULL,
        createdAt INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_rate_limit_hits_key_created ON rate_limit_hits(key, createdAt);
    `,
  },
];

export { hasColumn, hasIndex, hasTable };
