'use server';
import { z } from 'zod';
import { requireUser } from '@/lib/auth/guards';
import { storesRepo } from '@/lib/db/repositories/stores.repo';
import { can } from '@/lib/rbac';
import { Permission } from '@/lib/rbac';
import { revalidatePath } from 'next/cache';
import { membershipsRepo } from '@/lib/db/repositories/memberships.repo';

const schema = z.object({
  storeName: z.string().min(1).max(120),
  currency: z.string().min(1).max(8),
  tagline: z.string().max(160).optional().default(''),
  accent: z.string().regex(/^#([0-9a-fA-F]{6})$/, 'Use hex like #0ea5e9'),
  logoDataUrl: z.string().optional().default(''),
  currencySymbol: z.string().max(10).optional().default(''),
});

export async function saveBrand(
  storeId: string,
  input: z.infer<typeof schema>,
) {
  const session = await requireUser();
  if (!session.userId || session.activeStoreId !== storeId) return { error: 'Unauthorized' };
  const m = membershipsRepo.activeRole(session.userId, storeId);
  if (!can(m?.role, Permission.StoreBrand)) return { error: 'Not allowed' };
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  storesRepo.update(storeId, { name: parsed.data.storeName, currency: parsed.data.currency });
  storesRepo.updateBrand(storeId, {
    accent: parsed.data.accent,
    tagline: parsed.data.tagline,
    logoDataUrl: parsed.data.logoDataUrl || undefined,
    currencySymbol: parsed.data.currencySymbol || undefined,
  });

  revalidatePath('/settings/brand');
  revalidatePath('/', 'layout');
  return { ok: true };
}
