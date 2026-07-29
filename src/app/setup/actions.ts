'use server';
import { z } from 'zod';
import { usersRepo } from '@/lib/db/repositories/users.repo';
import { storesRepo } from '@/lib/db/repositories/stores.repo';
import { membershipsRepo } from '@/lib/db/repositories/memberships.repo';
import { productsRepo } from '@/lib/db/repositories/products.repo';
import { hasAnyUser } from '@/lib/auth/bootstrap';

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(1).max(80).default('Root'),
  storeName: z.string().min(1).max(80),
  currency: z.enum(['USD', 'NGN', 'EUR', 'GBP', 'KES', 'GHS', 'ZAR', 'INR']).default('USD'),
  demoData: z.coerce.boolean().default(true),
});

export type BootstrapManualInput = z.infer<typeof schema>;
export type BootstrapManualResult =
  | { ok: true; status: 'created'; email: string; storeSlug: string }
  | { ok: true; status: 'exists'; email: string };

/**
 * Web-only bootstrap. Use when .env is empty and a non-technical operator
 * needs to bring the server online without touching a config file.
 *
 * Safe to call multiple times — if a root user already exists, returns ok:'exists'
 * and does nothing destructive.
 */
export async function bootstrapManually(raw: unknown): Promise<BootstrapManualResult> {
  if (await hasAnyUser()) {
    return { ok: true, status: 'exists', email: '' };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? 'Invalid bootstrap input');
  }
  const { email, password, name, storeName, currency, demoData } = parsed.data;

  const root = await usersRepo.create({
    email,
    password,
    name,
    isRoot: true,
  });

  // Friendly auto-generated slug.
  const slug =
    `store-${Math.random().toString(36).slice(2, 6)}-${Date.now().toString(36).slice(-4)}`;
  const store = storesRepo.create({
    slug,
    name: storeName,
    currency,
    brand: { accent: '#0ea5e9', tagline: '' },
  });

  membershipsRepo.upsert(root.id, store.id, 'ROOT_ADMIN');

  if (demoData) {
    const demo: Array<{
      sku: string;
      name: string;
      costCents: number;
      sellCents: number;
      stockQty: number;
      lowStockThreshold?: number;
    }> = [
      { sku: 'RICE-5KG', name: 'Premium Rice 5kg', costCents: 4500, sellCents: 5500, stockQty: 24 },
      { sku: 'OIL-1L', name: 'Palm Oil 1L', costCents: 1200, sellCents: 1700, stockQty: 50 },
      { sku: 'BEANS-2KG', name: 'Brown Beans 2kg', costCents: 2200, sellCents: 2900, stockQty: 18, lowStockThreshold: 10 },
      { sku: 'SUGAR-1KG', name: 'Sugar 1kg', costCents: 900, sellCents: 1300, stockQty: 36 },
      { sku: 'MILK-1L', name: 'Long-life Milk 1L', costCents: 1100, sellCents: 1500, stockQty: 12, lowStockThreshold: 6 },
      { sku: 'BREAD-W', name: 'Whole-wheat Bread', costCents: 600, sellCents: 950, stockQty: 8, lowStockThreshold: 10 },
    ];
    for (const p of demo) productsRepo.create(store.id, p);
  }

  return { ok: true, status: 'created', email, storeSlug: slug };
}
