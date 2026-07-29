'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/guards';
import { storesRepo } from '@/lib/db/repositories/stores.repo';
import { membershipsRepo } from '@/lib/db/repositories/memberships.repo';

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  slug: z
    .string()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9-]+$/, 'Lowercase letters, digits, hyphens only'),
  currency: z.string().min(1).max(8).default('USD'),
});

export async function createStore(_prev: unknown, fd: FormData) {
  const session = await getSession();
  if (!session.userId || !session.isRoot) {
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
  const store = storesRepo.create(parsed.data);
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
