/**
 * Seed script (run with `npm run seed`).
 *
 * Reads .env automatically. Creates:
 *  - Root admin user (from ROOT_ADMIN_EMAIL / ROOT_ADMIN_PASSWORD env).
 *  - One sample store: "Greenmarket Demo".
 *  - Membership: root user is ROOT_ADMIN on that store.
 *  - Six demo products with realistic prices + stock.
 *
 * Idempotent: re-running is a no-op (skips if root already exists).
 */

import fs from 'node:fs';
import path from 'node:path';

// Load .env manually (no dotenv dep).
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+)\s*$/i);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}

// Now safe to import app code (env() validates after we set the vars above).
// (tsx handles TS natively — no need for ts-node.)
import { env } from '../src/env';
import { usersRepo } from '../src/lib/db/repositories/users.repo';
import { storesRepo } from '../src/lib/db/repositories/stores.repo';
import { membershipsRepo } from '../src/lib/db/repositories/memberships.repo';
import { productsRepo } from '../src/lib/db/repositories/products.repo';
import { getDB } from '../src/lib/db/sqlite';

async function main() {
  const cfg = env();
  getDB(); // runs migrations

  console.log('▸ Seeding…');
  let root: Awaited<ReturnType<typeof usersRepo.create>> | undefined;
  const hasRoot = usersRepo.list().some((u) => u.isRoot === 1);

  // Guard: if a root already exists (even under a different email after
  // a profile update), skip creation to avoid duplicates.
  if (hasRoot) {
    root = usersRepo.list().find((u) => u.isRoot === 1);
    console.log(`✓ Root admin already exists (skipping env-bootstrap): ${root?.email}`);
  } else {
    root = usersRepo.byEmail(cfg.ROOT_ADMIN_EMAIL);
    if (!root) {
      root = await usersRepo.create({
        email: cfg.ROOT_ADMIN_EMAIL,
        password: cfg.ROOT_ADMIN_PASSWORD,
        name: cfg.ROOT_ADMIN_NAME,
        isRoot: true,
      });
      console.log(`✓ Root admin created: ${root.email}`);
    } else {
      console.log(`✓ Root admin already exists: ${root.email}`);
    }
  }

  // Sample store (idempotent on slug).
  let store = storesRepo.list().find((s) => s.slug === 'greenmarket-demo');
  if (!store) {
    store = storesRepo.create({
      slug: 'greenmarket-demo',
      name: 'Greenmarket Demo',
      currency: cfg.ROOT_ADMIN_NAME.includes('NGN') ? 'NGN' : 'USD',
      brand: {
        accent: '#10b981',
        tagline: 'Fresh. Local. Daily.',
      },
    });
    console.log(`✓ Sample store created: ${store.name} (slug: ${store.slug})`);
  } else {
    console.log(`✓ Sample store already exists: ${store.name}`);
  }

  // Ensure root membership on the store.
  membershipsRepo.upsert(root.id, store.id, 'ROOT_ADMIN');

  // Seed products (only if store has none).
  const existingProducts = productsRepo.list(store.id);
  if (existingProducts.length === 0) {
    const demo: Array<{ sku: string; name: string; costCents: number; sellCents: number; stockQty: number; lowStockThreshold?: number; description?: string }> = [
      { sku: 'RICE-5KG', name: 'Premium Rice 5kg', costCents: 4500, sellCents: 5500, stockQty: 24, description: 'Long-grain white rice' },
      { sku: 'OIL-1L', name: 'Palm Oil 1L', costCents: 1200, sellCents: 1700, stockQty: 50 },
      { sku: 'BEANS-2KG', name: 'Brown Beans 2kg', costCents: 2200, sellCents: 2900, stockQty: 18, lowStockThreshold: 10 },
      { sku: 'SUGAR-1KG', name: 'Sugar 1kg', costCents: 900, sellCents: 1300, stockQty: 36 },
      { sku: 'MILK-1L', name: 'Long-life Milk 1L', costCents: 1100, sellCents: 1500, stockQty: 12, lowStockThreshold: 6 },
      { sku: 'BREAD-W', name: 'Whole-wheat Bread', costCents: 600, sellCents: 950, stockQty: 8, lowStockThreshold: 10 },
    ];
    for (const p of demo) {
      productsRepo.create(store.id, p);
    }
    console.log(`✓ ${demo.length} demo products added`);
  } else {
    console.log(`✓ ${existingProducts.length} products already in store`);
  }

  console.log('\n✅ Seed complete.');
  console.log('   Sign in with:');
  console.log(`     Email:    ${cfg.ROOT_ADMIN_EMAIL}`);
  console.log(`     Password: ${cfg.ROOT_ADMIN_PASSWORD}`);
  console.log(`   Then visit: ${cfg.APP_URL}`);
}

main().catch((e) => {
  console.error('✗ Seed failed:', e?.message ?? e);
  process.exit(1);
});
