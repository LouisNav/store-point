/** Isolated smoke test for audited inventory adjustments. */
import fs from 'node:fs';
import path from 'node:path';

const dbPath = path.resolve(process.cwd(), './data/inventory-test.db');
process.env.SQLITE_PATH = dbPath;
process.env.SESSION_PASSWORD = process.env.SESSION_PASSWORD ?? '12345678901234567890123456789012';
for (const suffix of ['', '-wal', '-shm']) {
  try { fs.unlinkSync(dbPath + suffix); } catch { /* already absent */ }
}

import { closeDB, getDB } from '../src/lib/db/sqlite';
import { usersRepo } from '../src/lib/db/repositories/users.repo';
import { storesRepo } from '../src/lib/db/repositories/stores.repo';
import { membershipsRepo } from '../src/lib/db/repositories/memberships.repo';
import { productsRepo } from '../src/lib/db/repositories/products.repo';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main() {
  getDB();
  try {
    const manager = await usersRepo.create({ email: 'inventory-manager@example.com', name: 'Manager', password: 'TestPass!123' });
    const inventory = await usersRepo.create({ email: 'inventory-staff@example.com', name: 'Inventory', password: 'TestPass!123' });
    const outsider = await usersRepo.create({ email: 'inventory-outsider@example.com', name: 'Outsider', password: 'TestPass!123' });
    const store = storesRepo.create({ slug: 'inventory-test', name: 'Inventory Test' });
    membershipsRepo.upsert(manager.id, store.id, 'MANAGER');
    membershipsRepo.upsert(inventory.id, store.id, 'INVENTORY');

    const product = productsRepo.create(store.id, {
      sku: 'TEST-1', name: 'Test item', costCents: 100, sellCents: 150, stockQty: 10,
    });
    const adjusted = productsRepo.adjustStock(store.id, product.id, 5, 'Received shipment', inventory.id);
    assert(adjusted?.stockQty === 15, 'stock should increase atomically');
    const attemptedMasterUpdate = productsRepo.update(store.id, product.id, { stockQty: 999 });
    assert(attemptedMasterUpdate?.stockQty === 15, 'product edits must not bypass stock-movement controls');
    const audit = productsRepo.inventoryAudit(store.id, product.id);
    assert(audit.length === 1 && audit[0]?.reason === 'Received shipment', 'adjustment reason should be audited');
    assert(audit[0]?.beforeQty === 10 && audit[0]?.afterQty === 15, 'audit should record before and after quantities');

    let missingReasonRejected = false;
    try { productsRepo.adjustStock(store.id, product.id, 1, '   ', inventory.id); } catch { missingReasonRejected = true; }
    assert(missingReasonRejected, 'blank adjustment reasons must be rejected');

    let outsiderRejected = false;
    try { productsRepo.adjustStock(store.id, product.id, 1, 'Unauthorised change', outsider.id); } catch { outsiderRejected = true; }
    assert(outsiderRejected, 'non-members must not adjust stock');

    let auditImmutable = false;
    try { getDB().prepare('UPDATE inventory_audit SET reason=? WHERE id=?').run('tampered', audit[0]!.id); } catch { auditImmutable = true; }
    assert(auditImmutable, 'inventory audit rows must be append-only');
    assert(getDB().prepare("SELECT COUNT(*) AS count FROM outbox WHERE collection='InventoryAudit'").get().count === 1, 'inventory audit should enter the outbox');
    console.log('✓ inventory smoke test passed');
  } finally {
    closeDB();
    for (const suffix of ['', '-wal', '-shm']) {
      try { fs.unlinkSync(dbPath + suffix); } catch { /* already absent */ }
    }
  }
}

main().catch((error) => {
  console.error('✗ inventory smoke test failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
