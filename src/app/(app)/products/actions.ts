'use server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { usersRepo } from '@/lib/db/repositories/users.repo';
import { membershipsRepo } from '@/lib/db/repositories/memberships.repo';
import { productsRepo } from '@/lib/db/repositories/products.repo';
import { getSession } from '@/lib/auth/guards';
import { can } from '@/lib/rbac';
import { Permission } from '@/lib/rbac';
import { getDB } from '@/lib/db/sqlite';
import type { Role } from '@/lib/types';

async function userRoleIn(userId: string, storeId: string): Promise<Role | undefined> {
  const m = membershipsRepo.activeRole(userId, storeId);
  return m?.role;
}

const baseSchema = {
  sku: z.string().min(1).max(40),
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional().default(''),
  costCents: z.coerce.number().int().nonnegative(),
  sellCents: z.coerce.number().int().nonnegative(),
  stockQty: z.coerce.number().int().nonnegative(),
  lowStockThreshold: z.coerce.number().int().nonnegative().default(5),
  active: z
    .union([z.literal('true'), z.literal('false'), z.literal('on'), z.literal('off')])
    .default('true')
    .transform((v) => v === 'true' || v === 'on'),
};

export async function createProduct(storeId: string, fd: FormData) {
  const session = await getSession();
  if (!session.userId || !session.activeStoreId) return { error: 'Unauthorized' };
  const role = await userRoleIn(session.userId, storeId);
  if (!can(role, Permission.ProductsWrite)) return { error: 'Not allowed' };

  const schema = z.object(baseSchema);
  const parsed = schema.safeParse({
    sku: fd.get('sku'),
    name: fd.get('name'),
    description: fd.get('description') ?? '',
    costCents: fd.get('costCents'),
    sellCents: fd.get('sellCents'),
    stockQty: fd.get('stockQty'),
    lowStockThreshold: fd.get('lowStockThreshold') ?? '5',
    active: fd.get('active') ?? 'true',
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  try {
    const p = productsRepo.create(storeId, {
      sku: parsed.data.sku,
      name: parsed.data.name,
      description: parsed.data.description,
      costCents: can(role, Permission.ProductsReadCost) ? parsed.data.costCents : 0,
      sellCents: parsed.data.sellCents,
      stockQty: parsed.data.stockQty,
      lowStockThreshold: parsed.data.lowStockThreshold,
      active: parsed.data.active,
    });
    revalidatePath('/products');
    return { ok: true, id: p.id };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function updateProduct(storeId: string, fd: FormData) {
  const session = await getSession();
  if (!session.userId) return { error: 'Unauthorized' };
  const role = await userRoleIn(session.userId, storeId);
  if (!can(role, Permission.ProductsWrite)) return { error: 'Not allowed' };

  const schema = z.object({ id: z.string().min(1), ...baseSchema });
  const parsed = schema.safeParse({
    id: fd.get('id'),
    sku: fd.get('sku'),
    name: fd.get('name'),
    description: fd.get('description') ?? '',
    costCents: fd.get('costCents'),
    sellCents: fd.get('sellCents'),
    stockQty: fd.get('stockQty'),
    lowStockThreshold: fd.get('lowStockThreshold') ?? '5',
    active: fd.get('active') ?? 'true',
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  try {
    const p = productsRepo.update(storeId, parsed.data.id, {
      sku: parsed.data.sku,
      name: parsed.data.name,
      description: parsed.data.description,
      costCents: can(role, Permission.ProductsReadCost) ? parsed.data.costCents : undefined,
      sellCents: parsed.data.sellCents,
      stockQty: parsed.data.stockQty,
      lowStockThreshold: parsed.data.lowStockThreshold,
      active: parsed.data.active,
    });
    revalidatePath('/products');
    revalidatePath(`/products/${parsed.data.id}/edit`);
    return { ok: true, id: parsed.data.id };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function deleteProduct(storeId: string, fd: FormData) {
  const session = await getSession();
  if (!session.userId) return { error: 'Unauthorized' };
  const role = await userRoleIn(session.userId, storeId);
  if (!can(role, Permission.ProductsWrite)) return { error: 'Not allowed' };
  const id = String(fd.get('id') || '');
  if (!id) return { error: 'Missing id' };
  productsRepo.softDelete(storeId, id);
  revalidatePath('/products');
  return { ok: true };
}

export async function adjustStock(storeId: string, id: string, delta: number) {
  const session = await getSession();
  if (!session.userId) return { error: 'Unauthorized' };
  const role = await userRoleIn(session.userId, storeId);
  if (!can(role, Permission.StockAdjust)) return { error: 'Not allowed' };
  try {
    productsRepo.adjustStock(storeId, id, delta);
    revalidatePath('/products');
    return { ok: true };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
