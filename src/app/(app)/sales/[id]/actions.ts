'use server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/guards';
import { membershipsRepo } from '@/lib/db/repositories/memberships.repo';
import { salesRepo } from '@/lib/db/repositories/sales.repo';
import { can } from '@/lib/rbac';
import { Permission } from '@/lib/rbac';

const lineSchema = z.object({
  saleItemId: z.string().min(1),
  qty: z.number().int().positive(),
});

const inputSchema = z.object({
  saleId: z.string().min(1),
  reason: z.string().max(500).optional().default(''),
  lines: z.array(lineSchema).min(1),
  idempotencyKey: z.string().min(1).max(80).optional(),
});

export type RefundActionResult = { ok: true } | { ok: false; error: string };

export async function refundSale(_prev: unknown, fd: FormData): Promise<RefundActionResult> {
  const session = await requireUser();
  if (!session.userId) return { ok: false, error: 'Unauthorized' };
  if (!session.activeStoreId) return { ok: false, error: 'No active store' };

  const membership = membershipsRepo.activeRole(session.userId, session.activeStoreId);
  if (!membership) return { ok: false, error: 'Not a member of this store' };
  if (!can(membership.role, Permission.SalesRefund)) {
    return { ok: false, error: 'You do not have permission to refund' };
  }

  let rawLines: unknown = [];
  try {
    rawLines = JSON.parse(String(fd.get('lines') ?? '[]'));
  } catch {
    return { ok: false, error: 'Bad input' };
  }
  const parsed = inputSchema.safeParse({
    saleId: fd.get('saleId'),
    reason: fd.get('reason') ?? '',
    lines: rawLines,
    idempotencyKey: fd.get('idempotencyKey') || undefined,
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  try {
    // salesRepo.refund scopes the lookup by storeId. We pin to session identity,
    // ignoring any forge attempts on the form data.
    salesRepo.refund({
      storeId: session.activeStoreId,
      saleId: parsed.data.saleId,
      cashierId: session.userId,
      reason: parsed.data.reason,
      lines: parsed.data.lines,
      idempotencyKey: parsed.data.idempotencyKey,
    });
    revalidatePath(`/sales/${parsed.data.saleId}`);
    revalidatePath('/sales');
    revalidatePath('/dashboard');
    revalidatePath('/reports/cashup');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
