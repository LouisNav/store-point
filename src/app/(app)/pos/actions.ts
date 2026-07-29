'use server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { getSession } from '@/lib/auth/guards';
import { membershipsRepo } from '@/lib/db/repositories/memberships.repo';
import { salesRepo } from '@/lib/db/repositories/sales.repo';
import { can } from '@/lib/rbac';
import { Permission } from '@/lib/rbac';

const lineSchema = z.object({
  productId: z.string().min(1),
  qty: z.number().int().positive(),
});

const inputSchema = z.object({
  customerId: z.string().nullable().optional(),
  paymentMethod: z.enum(['cash', 'mobile', 'card', 'other']).default('cash'),
  discountCents: z.coerce.number().int().nonnegative().default(0),
  lines: z.array(lineSchema).min(1),
  idempotencyKey: z.string().min(1).max(80).optional(),
});

export type CheckoutActionResult =
  | { ok: true; saleId: string; receiptNumber: string }
  | { ok: false; error: string };

export async function checkout(_prev: unknown, fd: FormData): Promise<CheckoutActionResult> {
  // ---- Identity / authorization come from the session, never the form ----
  const session = await getSession();
  if (!session.userId) return { ok: false, error: 'Unauthorized' };
  if (!session.activeStoreId) return { ok: false, error: 'No active store' };

  const membership = membershipsRepo.activeRole(session.userId, session.activeStoreId);
  if (!membership) return { ok: false, error: 'Not a member of this store' };
  if (!can(membership.role, Permission.SalesCreate)) {
    return { ok: false, error: 'You do not have permission to make sales' };
  }

  // ---- Input (excluding identity) ----
  let rawLines: unknown = [];
  try {
    rawLines = JSON.parse(String(fd.get('lines') ?? '[]'));
  } catch {
    return { ok: false, error: 'Bad cart data' };
  }
  const parsed = inputSchema.safeParse({
    customerId: fd.get('customerId') || null,
    paymentMethod: fd.get('paymentMethod'),
    discountCents: fd.get('discountCents') || '0',
    lines: rawLines,
    idempotencyKey: fd.get('idempotencyKey') || undefined,
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  // Re-verify line productIds belong to active store: use salesRepo.checkout's
  // own scoping because it queries products WHERE storeId=? AND id=?, so passing
  // activeStoreId is enough — but we explicitly pin both storeId and cashierId
  // to identity-derived values, ignoring any forge attempts.
  try {
    const result = salesRepo.checkout({
      storeId: session.activeStoreId,
      cashierId: session.userId,
      customerId: parsed.data.customerId ?? null,
      paymentMethod: parsed.data.paymentMethod,
      discountCents: parsed.data.discountCents,
      lines: parsed.data.lines,
      idempotencyKey: parsed.data.idempotencyKey,
    });
    revalidatePath('/dashboard');
    revalidatePath('/sales');
    revalidatePath('/reports/cashup');
    return { ok: true, saleId: result.sale.id, receiptNumber: result.receiptNumber };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
