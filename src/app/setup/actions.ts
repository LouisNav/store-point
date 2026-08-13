'use server';
import { z } from 'zod';
import { usersRepo } from '@/lib/db/repositories/users.repo';
import { storesRepo } from '@/lib/db/repositories/stores.repo';
import { membershipsRepo } from '@/lib/db/repositories/memberships.repo';
import { productsRepo } from '@/lib/db/repositories/products.repo';
import { hasAnyUser } from '@/lib/auth/bootstrap';
import { demoProducts } from '@/lib/demo-data';

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(1).max(80).default('Root'),
  storeName: z.string().min(1).max(80),
  currency: z
    .string()
    .trim()
    .min(1, 'Currency code is required')
    .max(8)
    .transform((v) => v.toUpperCase())
    .default('USD'),
  currencySymbol: z.string().trim().max(10).optional().default(''),
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
  const { email, password, name, storeName, currency, currencySymbol, demoData } = parsed.data;

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
    brand: { accent: '#0ea5e9', tagline: '', currencySymbol: currencySymbol || undefined },
  });

  membershipsRepo.upsert(root.id, store.id, 'ROOT_ADMIN');

  if (demoData) {
    for (const p of demoProducts(currency)) productsRepo.create(store.id, p);
  }

  return { ok: true, status: 'created', email, storeSlug: slug };
}
