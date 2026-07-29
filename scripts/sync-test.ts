/**
 * End-to-end sync round-trip test.
 *
 * Pre-req: `npm install` (pulls `mongodb-memory-server`).
 * Run:    `npm run test:sync`
 *
 * It spins up an in-process MongoDB (no external infra), resets the TEST
 * SQLite (separate from the dev/prod storepoint.db), seeds minimal data,
 * performs a sale offline, drains the outbox into Mongo, and asserts the
 * round-trip (including idempotency re-runs and soft deletes).
 *
 * IMPORTANT: we override `process.env.SQLITE_PATH` to point at the test DB
 * *before* env() is called, otherwise env() caches the dev `./data/storepoint.db`
 * path and getDB() would open the dev/prod database instead of the isolated
 * test database. That would make this test destructive to user data.
 */

import fs from 'node:fs';
import path from 'node:path';

// Load .env manually before any app code.
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+)\s*$/i);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}

import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

import { env } from '../src/env';
import { getDB, closeDB } from '../src/lib/db/sqlite';
import { closeMongo, getMongo } from '../src/lib/db/mongo';
import { outboxRepo } from '../src/lib/db/repositories/outbox.repo';
import { productsRepo } from '../src/lib/db/repositories/products.repo';
import { storesRepo } from '../src/lib/db/repositories/stores.repo';
import { usersRepo } from '../src/lib/db/repositories/users.repo';
import { membershipsRepo } from '../src/lib/db/repositories/memberships.repo';
import { salesRepo } from '../src/lib/db/repositories/sales.repo';
import { syncNow } from '../src/lib/sync';
import { M } from '../src/lib/db/mongo-models';

function bail(msg: string): never {
  console.error(`\n\u2717 ${msg}`);
  process.exit(1);
}

async function main() {
  // 1. Boot mongodb-memory-server FIRST so MONGODB_URI is in process.env
  //    BEFORE the first env() call. env() caches its zod-parsed result, so
  //    calling it before this would lock in MONGODB_URI = '' and the drain
  //    would short-circuit to "online: false".
  console.log('\u25b8 Starting mongodb-memory-server\u2026');
  const mongo = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongo.getUri();
  console.log(`  \u2713 \u2192 ${mongo.getUri()}`);

  // 2. Decide the TEST SQLite path and override SQLITE_PATH BEFORE env()
  //    caches. We need the cached cfg.SQLITE_PATH to point at the test DB so
  //    getDB() opens a fresh, isolated file instead of the dev/prod storepoint.db.
  const testDbPath = path.resolve(
    process.cwd(),
    process.env.TEST_SQLITE_PATH ?? './data/test.db',
  );
  process.env.SQLITE_PATH = testDbPath;

  // 3. Now safe to read env (caches the same URI/paths we just set).
  const cfg = env();
  const dbPath = testDbPath;

  // 4. Reset the TEST SQLite so migrations run fresh.
  for (const ext of ['', '-wal', '-shm']) {
    const p = dbPath + ext;
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
  console.log('\u25b8 Reset SQLite at', dbPath);

  // 5. Boot SQLite (runs migrations on the empty TEST DB).
  getDB();

  try {
    // 6. Bootstrap minimal tenant fixtures.
    const user = await usersRepo.create({
      email: 'sync-test@example.com',
      password: 'TestPass!123',
      name: 'Sync Test',
      isRoot: true,
    });
    const store = storesRepo.create({
      slug: 'sync-test-store',
      name: 'Sync Test Store',
      currency: 'USD',
    });
    membershipsRepo.upsert(user.id, store.id, 'ROOT_ADMIN');
    const product = productsRepo.create(store.id, {
      sku: 'TEST-1',
      name: 'Test item',
      costCents: 100,
      sellCents: 200,
      stockQty: 10,
    });

    const pendingAfterSetup = outboxRepo.pendingCount();
    if (pendingAfterSetup < 4) {
      bail(`Expected >=4 outbox entries after bootstrap, got ${pendingAfterSetup}`);
    }
    console.log(`  \u2713 Bootstrap queued ${pendingAfterSetup} outbox ops`);

    // 7. Create a sale offline (no Mongo round-trip).
    const result = salesRepo.checkout({
      storeId: store.id,
      cashierId: user.id,
      customerId: null,
      lines: [{ productId: product.id, qty: 2 }],
      paymentMethod: 'cash',
      discountCents: 0,
      idempotencyKey: 'idem-test-1',
    });
    console.log(`  \u2713 Sale offline: ${result.sale.id} \u00b7 ${result.receiptNumber}`);

    // 8. Idempotency: same key returns SAME sale, no duplicate.
    const dup = salesRepo.checkout({
      storeId: store.id,
      cashierId: user.id,
      customerId: null,
      lines: [{ productId: product.id, qty: 1 }], // different qty: must be ignored
      paymentMethod: 'cash',
      discountCents: 0,
      idempotencyKey: 'idem-test-1',
    });
    if (dup.sale.id !== result.sale.id) {
      bail(`Idempotency failed: expected ${result.sale.id}, got ${dup.sale.id}`);
    }
    console.log(`  \u2713 Idempotency: same key returns same sale (no duplicate)`);

    const pendingBeforeSync = outboxRepo.pendingCount();
    console.log(`  \u25b8 Outbox pending before drain: ${pendingBeforeSync}`);

    // 9. Drain everything into Mongo.
    const drained = await syncNow();
    if (drained < 4) bail(`Expected at least 4 ops drained, got ${drained}`);
    console.log(`  \u2713 Drained ${drained} ops into Mongo`);

    if (outboxRepo.pendingCount() !== 0) {
      bail(`Expected outbox empty after drain, got ${outboxRepo.pendingCount()}`);
    }
    console.log(`  \u2713 Outbox empty`);

    // 10. Verify Mongo state via mongoose. `.lean()` types are generic under
    //     `strict: false`; we cast to the concrete record for assertion clarity.
    await getMongo();
    const syncedSale = (await M.Sale.findById(result.sale.id).lean()) as unknown as {
      _id: string;
      totalCents: number;
    } | null;
    if (!syncedSale) bail('Sale missing from Mongo after drain');
    if (syncedSale.totalCents !== 400) {
      bail(`Sale.totalCents in Mongo expected 400, got ${syncedSale.totalCents}`);
    }
    console.log(`  \u2713 Sale present in Mongo (totalCents=${syncedSale.totalCents})`);

    const syncedProduct = (await M.Product.findById(product.id).lean()) as unknown as {
      _id: string;
      stockQty: number;
    } | null;
    if (!syncedProduct) bail('Product missing from Mongo');
    if (syncedProduct.stockQty !== 8) {
      bail(`Product.stockQty in Mongo expected 8 (10-2), got ${syncedProduct.stockQty}`);
    }
    console.log(`  \u2713 Product adjusted in Mongo (stockQty=${syncedProduct.stockQty})`);

    const syncedItems = (await M.SaleItem.find({ saleId: result.sale.id }).lean()) as unknown as Array<{
      _id: string;
      saleId: string;
    }>;
    if (syncedItems.length !== 1) {
      bail(`Expected 1 SaleItem in Mongo for the sale, got ${syncedItems.length}`);
    }
    console.log(`  \u2713 SaleItems present in Mongo (count=${syncedItems.length})`);

    // 11. Soft delete: drain + assert deletedAt present in Mongo.
    productsRepo.softDelete(store.id, product.id);
    await syncNow();
    const softDeleted = (await M.Product.findById(product.id).lean()) as unknown as {
      _id: string;
      deletedAt?: string;
    } | null;
    if (!softDeleted || !softDeleted.deletedAt) {
      bail(`Expected soft-delete to set deletedAt in Mongo`);
    }
    console.log(`  \u2713 Soft-delete propagated to Mongo (deletedAt=${softDeleted.deletedAt})`);

    // 12. Re-running sync is a no-op.
    const repeat = await syncNow();
    if (repeat !== 0) bail(`Second drain should be no-op, got ${repeat}`);
    console.log(`  \u2713 Re-drain is no-op (drained=0)`);

    console.log('\n\u2705 Sync round-trip test passed.');
  } finally {
    // Always tear down — even if any assertion bails, we don't want a leaked
    // mongodb-memory-server child process or open DB connections carried
    // between runs.
    try { await mongoose.disconnect(); } catch { /* ignore */ }
    try { await mongo.stop(); }       catch { /* ignore */ }
    try { closeDB(); }               catch { /* ignore */ }
  }
}

main().catch((e) => {
  console.error('\u2717 sync-test failed:', e?.stack ?? e?.message ?? e);
  process.exit(1);
});
