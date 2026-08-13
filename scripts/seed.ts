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
import { demoProducts } from '../src/lib/demo-data';

async function main() {
  const cfg = env();
  getDB(); // runs migrations

  if (!cfg.ROOT_ADMIN_EMAIL || !cfg.ROOT_ADMIN_PASSWORD) {
    console.error(
      '✗ ROOT_ADMIN_EMAIL and ROOT_ADMIN_PASSWORD are required to run `npm run seed`.\n' +
      '  Set them in your .env file, or open /setup in your browser and create the first account there instead.',
    );
    process.exit(1);
  }

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
      currency: cfg.SEED_STORE_CURRENCY,
      brand: {
        accent: '#10b981',
        tagline: 'Fresh. Local. Daily.',
        currencySymbol: cfg.SEED_STORE_CURRENCY_SYMBOL || undefined,
      },
    });
    console.log(`✓ Sample store created: ${store.name} (slug: ${store.slug}, currency: ${store.currency})`);
  } else {
    console.log(`✓ Sample store already exists: ${store.name}`);
  }

  // Ensure root membership on the store.
  membershipsRepo.upsert(root.id, store.id, 'ROOT_ADMIN');

  // Seed products (only if store has none).
  const existingProducts = productsRepo.list(store.id);
  if (existingProducts.length === 0) {
    const demo = demoProducts(cfg.SEED_STORE_CURRENCY);
    for (const p of demo) {
      productsRepo.create(store.id, p);
    }
    console.log(`✓ ${demo.length} demo products added (currency: ${cfg.SEED_STORE_CURRENCY})`);
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
