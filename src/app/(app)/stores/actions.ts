'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { isRootUser, requireUser } from '@/lib/auth/guards';
import { storesRepo } from '@/lib/db/repositories/stores.repo';
import { membershipsRepo } from '@/lib/db/repositories/memberships.repo';

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  slug: z
    .string()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9-]+$/, 'Lowercase letters, digits, hyphens only'),
  currency: z.string().trim().min(1).max(8).transform((v) => v.toUpperCase()).default('USD'),
  currencySymbol: z.string().trim().max(10).optional().default(''),
});

export async function createStore(_prev: unknown, fd: FormData) {
  const session = await requireUser();
  if (!session.userId || !(await isRootUser(session))) {
    return { error: 'Only the root admin can create stores.' };
  }
  const parsed = schema.safeParse({
    name: fd.get('name'),
    slug: fd.get('slug'),
    currency: fd.get('currency') ?? 'USD',
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }
  if (storesRepo.bySlug(parsed.data.slug)) {
    return { error: 'That slug is already taken.' };
  }
  const store = storesRepo.create({
    name: parsed.data.name,
    slug: parsed.data.slug,
    currency: parsed.data.currency,
    brand: { currencySymbol: parsed.data.currencySymbol || undefined },
  });
  membershipsRepo.upsert(session.userId, store.id, 'ROOT_ADMIN');
  session.memberships = [
    ...(session.memberships ?? []),
    { storeId: store.id, storeName: store.name, role: 'ROOT_ADMIN' },
  ];
  session.activeStoreId = store.id;
  await session.save();
  revalidatePath('/stores');
  redirect('/dashboard');
}
