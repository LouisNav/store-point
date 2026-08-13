'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { isRootUser, requireUser } from '@/lib/auth/guards';
import { membershipsRepo } from '@/lib/db/repositories/memberships.repo';
import { globalAnnouncementsRepo } from '@/lib/db/repositories/global-announcements.repo';
import { auditRepo } from '@/lib/db/repositories/audit.repo';

const announcementSchema = z.object({
  title: z.string().trim().min(3).max(160),
  body: z.string().trim().min(3).max(4000),
  priority: z.enum(['normal', 'high', 'critical']).default('normal'),
  requiresAck: z.boolean().default(false),
  expiresAt: z.string().datetime({ offset: true }).nullable().optional(),
});

type ActionResult = { ok: true } | { ok: false; error: string };

async function rootContext() {
  const session = await requireUser();
  if (!session.userId || !(await isRootUser(session)) || !session.activeStoreId) return null;
  // Root status is a platform-level privilege; it intentionally does not
  // depend on a store membership so a super admin can cross stores.
  return { session, userId: session.userId, storeId: session.activeStoreId };
}

export async function createGlobalAnnouncement(input: {
  title: string;
  body: string;
  priority: 'normal' | 'high' | 'critical';
  requiresAck: boolean;
  expiresAt?: string | null;
}): Promise<ActionResult & { id?: string }> {
  const ctx = await rootContext();
  if (!ctx) return { ok: false, error: 'Only the root administrator can publish global announcements.' };
  const parsed = announcementSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  try {
    const announcement = globalAnnouncementsRepo.create({ ...parsed.data, createdById: ctx.userId });
    auditRepo.record({
      storeId: ctx.storeId,
      actorId: ctx.userId,
      actorEmail: ctx.session.email ?? null,
      action: 'announcement.create',
      entityType: 'GlobalAnnouncement',
      entityId: announcement.id,
      metadata: { title: announcement.title, priority: announcement.priority, requiresAck: announcement.requiresAck === 1 },
    });
    revalidatePath('/settings/announcements');
    revalidatePath('/', 'layout');
    return { ok: true, id: announcement.id };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}

export async function acknowledgeGlobalAnnouncement(announcementId: string): Promise<ActionResult> {
  const session = await requireUser();
  if (!session.userId || !session.activeStoreId) return { ok: false, error: 'Unauthorized' };
  const membership = membershipsRepo.activeRole(session.userId, session.activeStoreId);
  if (!membership && !(await isRootUser(session))) return { ok: false, error: 'Unauthorized' };
  const ack = globalAnnouncementsRepo.acknowledge(announcementId, session.userId, session.activeStoreId);
  if (!ack) return { ok: false, error: 'Announcement is no longer active.' };
  return { ok: true };
}
