'use server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/guards';
import { membershipsRepo } from '@/lib/db/repositories/memberships.repo';
import { customersRepo } from '@/lib/db/repositories/customers.repo';
import { can } from '@/lib/rbac';
import { Permission } from '@/lib/rbac';

const inputSchema = z.object({
  name: z.string().min(1),
  phone: z.string().max(40).optional().default(''),
  email: z.string().email().or(z.literal('')).optional().default(''),
  notes: z.string().max(500).optional().default(''),
});

export type CustomerActionResult = { ok: true } | { ok: false; error: string };

export async function createCustomer(raw: z.infer<typeof inputSchema>): Promise<CustomerActionResult> {
  const session = await requireUser();
  if (!session.userId) return { ok: false, error: 'Unauthorized' };
  if (!session.activeStoreId) return { ok: false, error: 'No active store' };

  const membership = membershipsRepo.activeRole(session.userId, session.activeStoreId);
  if (!membership) return { ok: false, error: 'Not a member of this store' };
  if (!can(membership.role, Permission.CustomersWrite)) {
    return { ok: false, error: 'You do not have permission to add customers' };
  }

  const parsed = inputSchema.safeParse({
    name: (raw.name ?? '').trim(),
    phone: raw.phone ?? '',
    email: raw.email ?? '',
    notes: raw.notes ?? '',
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  try {
    customersRepo.create(session.activeStoreId, {
      name: parsed.data.name,
      phone: parsed.data.phone,
      email: parsed.data.email,
      notes: parsed.data.notes,
    });
    revalidatePath('/customers');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
