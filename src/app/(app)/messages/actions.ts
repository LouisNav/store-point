'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { isRootUser, requireUser } from '@/lib/auth/guards';
import { membershipsRepo } from '@/lib/db/repositories/memberships.repo';
import { messagingRepo } from '@/lib/db/repositories/messaging.repo';
import { can } from '@/lib/rbac';
import { Permission } from '@/lib/rbac';
import { messagingThrottle } from '@/lib/auth/throttle';
import type { MessageRevision } from '@/lib/types';

const bodySchema = z.string().trim().min(1, 'Message cannot be empty.').max(4000, 'Messages must be 4,000 characters or less.');
const emojiSchema = z.string().trim().min(1).max(12);

type ActionResult = { ok: true } | { ok: false; error: string };

async function context() {
  const session = await requireUser();
  if (!session.userId || !session.activeStoreId) return null;
  const membership = membershipsRepo.activeRole(session.userId, session.activeStoreId);
  const root = await isRootUser(session);
  if (!membership && !root) return null;
  return { session, userId: session.userId, storeId: session.activeStoreId, role: root ? 'ROOT_ADMIN' as const : membership!.role };
}

export async function startDirectConversation(targetUserId: string): Promise<ActionResult & { channelId?: string }> {
  const ctx = await context();
  if (!ctx) return { ok: false, error: 'Unauthorized' };
  if (!can(ctx.role, Permission.MessagingDirect)) return { ok: false, error: 'Only managers can start direct conversations.' };
  const target = z.string().min(1).safeParse(targetUserId);
  if (!target.success || target.data === ctx.userId) return { ok: false, error: 'Choose another active store member.' };
  if (!membershipsRepo.activeRole(target.data, ctx.storeId)) return { ok: false, error: 'That person is not an active member of this store.' };
  try {
    const channel = messagingRepo.createDirectConversation(ctx.storeId, ctx.userId, target.data);
    revalidatePath('/messages');
    return { ok: true, channelId: channel.id };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}

export async function sendMessage(input: {
  channelId: string;
  body: string;
  parentId?: string | null;
}): Promise<ActionResult> {
  const ctx = await context();
  if (!ctx) return { ok: false, error: 'Unauthorized' };
  const parsed = bodySchema.safeParse(input.body);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const channel = messagingRepo.byId(ctx.storeId, input.channelId);
  if (!channel) return { ok: false, error: 'Channel not found.' };
  if (channel.kind === 'direct' && !messagingRepo.isParticipant(ctx.storeId, channel.id, ctx.userId)) {
    return { ok: false, error: 'You are not a participant in this conversation.' };
  }
  let parentId: string | null = input.parentId ?? null;
  if (parentId) {
    const parent = messagingRepo.byIdMessage(ctx.storeId, parentId, ctx.userId);
    if (!parent || parent.channelId !== channel.id) return { ok: false, error: 'Thread not found.' };
  }

  // Announcements are manager-controlled top-level posts. Replies remain open
  // to the store team so staff can ask clarifying operational questions.
  const requiredPermission = channel.kind === 'direct'
    ? Permission.MessagingRead
    : channel.kind === 'announcement' && !parentId
      ? Permission.MessagingAnnouncement
      : Permission.MessagingWrite;
  if (!can(ctx.role, requiredPermission)) return { ok: false, error: 'You do not have permission to post here.' };
  if (!messagingThrottle(`${ctx.storeId}:${ctx.userId}`).allowed) return { ok: false, error: 'You are sending messages too quickly. Please try again in a moment.' };

  try {
    messagingRepo.createMessage({
      storeId: ctx.storeId,
      channelId: channel.id,
      authorId: ctx.userId,
      body: parsed.data,
      parentId,
      requiresAck: channel.kind === 'announcement' && !parentId,
    });
    revalidatePath('/messages');
    return { ok: true };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}

export async function editMessage(messageId: string, body: string): Promise<ActionResult> {
  const ctx = await context();
  if (!ctx) return { ok: false, error: 'Unauthorized' };
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const message = messagingRepo.byIdMessage(ctx.storeId, messageId, ctx.userId);
  if (!message) return { ok: false, error: 'Message not found.' };
  const channel = messagingRepo.byId(ctx.storeId, message.channelId);
  if (channel?.kind === 'direct' && !messagingRepo.isParticipant(ctx.storeId, channel.id, ctx.userId)) return { ok: false, error: 'Message not found.' };
  if (message.authorId !== ctx.userId) {
    return { ok: false, error: 'Only the original author may edit a message. Managers and admins cannot alter another user\'s text.' };
  }
  try {
    messagingRepo.editMessage(ctx.storeId, messageId, parsed.data, ctx.userId);
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
  revalidatePath('/messages');
  return { ok: true };
}

export async function getMessageRevisions(messageId: string): Promise<ActionResult & { revisions?: MessageRevision[] }> {
  const ctx = await context();
  if (!ctx) return { ok: false, error: 'Unauthorized' };
  const message = messagingRepo.byIdMessage(ctx.storeId, messageId, ctx.userId);
  if (!message) return { ok: false, error: 'Message not found.' };
  if (message.authorId !== ctx.userId && !can(ctx.role, Permission.MessagingAudit)) {
    return { ok: false, error: 'You do not have permission to view this message history.' };
  }
  return { ok: true, revisions: messagingRepo.listRevisions(ctx.storeId, messageId) };
}

export async function deleteMessage(messageId: string): Promise<ActionResult> {
  const ctx = await context();
  if (!ctx) return { ok: false, error: 'Unauthorized' };
  const message = messagingRepo.byIdMessage(ctx.storeId, messageId, ctx.userId);
  if (!message) return { ok: false, error: 'Message not found.' };
  const channel = messagingRepo.byId(ctx.storeId, message.channelId);
  if (channel?.kind === 'direct' && !messagingRepo.isParticipant(ctx.storeId, channel.id, ctx.userId)) return { ok: false, error: 'Message not found.' };
  if (message.authorId !== ctx.userId && !can(ctx.role, Permission.MessagingModerate)) {
    return { ok: false, error: 'You can only delete your own messages.' };
  }
  messagingRepo.deleteMessage(ctx.storeId, messageId, ctx.userId);
  revalidatePath('/messages');
  return { ok: true };
}

export async function toggleReaction(messageId: string, emoji: string): Promise<ActionResult> {
  const ctx = await context();
  if (!ctx) return { ok: false, error: 'Unauthorized' };
  const parsed = emojiSchema.safeParse(emoji);
  if (!parsed.success) return { ok: false, error: 'Invalid reaction.' };
  const message = messagingRepo.byIdMessage(ctx.storeId, messageId, ctx.userId);
  if (!message) return { ok: false, error: 'Message not found.' };
  const channel = messagingRepo.byId(ctx.storeId, message.channelId);
  if (channel?.kind === 'direct' && !messagingRepo.isParticipant(ctx.storeId, channel.id, ctx.userId)) return { ok: false, error: 'Message not found.' };
  if (!can(ctx.role, channel?.kind === 'direct' ? Permission.MessagingRead : Permission.MessagingWrite)) return { ok: false, error: 'You do not have permission to react.' };
  messagingRepo.toggleReaction(ctx.storeId, messageId, ctx.userId, parsed.data);
  revalidatePath('/messages');
  return { ok: true };
}

export async function togglePin(messageId: string): Promise<ActionResult> {
  const ctx = await context();
  if (!ctx) return { ok: false, error: 'Unauthorized' };
  if (!can(ctx.role, Permission.MessagingModerate)) return { ok: false, error: 'Only managers can pin messages.' };
  const message = messagingRepo.byIdMessage(ctx.storeId, messageId, ctx.userId);
  if (!message) return { ok: false, error: 'Message not found.' };
  const channel = messagingRepo.byId(ctx.storeId, message.channelId);
  if (channel?.kind === 'direct' && !messagingRepo.isParticipant(ctx.storeId, channel.id, ctx.userId)) return { ok: false, error: 'Message not found.' };
  messagingRepo.togglePin(ctx.storeId, messageId, ctx.userId);
  revalidatePath('/messages');
  return { ok: true };
}

export async function markChannelRead(channelId: string): Promise<ActionResult> {
  const ctx = await context();
  if (!ctx) return { ok: false, error: 'Unauthorized' };
  if (!can(ctx.role, Permission.MessagingRead)) return { ok: false, error: 'Not allowed.' };
  const channel = messagingRepo.byId(ctx.storeId, channelId);
  if (!channel || (channel.kind === 'direct' && !messagingRepo.isParticipant(ctx.storeId, channelId, ctx.userId))) return { ok: false, error: 'Conversation not found.' };
  messagingRepo.markRead(ctx.storeId, channelId, ctx.userId);
  revalidatePath('/messages');
  return { ok: true };
}

export async function acknowledgeAnnouncement(messageId: string): Promise<ActionResult> {
  const ctx = await context();
  if (!ctx) return { ok: false, error: 'Unauthorized' };
  if (!can(ctx.role, Permission.MessagingRead)) return { ok: false, error: 'Not allowed.' };
  const message = messagingRepo.byIdMessage(ctx.storeId, messageId, ctx.userId);
  const channel = message ? messagingRepo.byId(ctx.storeId, message.channelId) : undefined;
  if (!message || !message.requiresAck || channel?.kind !== 'announcement') return { ok: false, error: 'Announcement not found.' };
  messagingRepo.acknowledge(ctx.storeId, messageId, ctx.userId);
  revalidatePath('/messages');
  return { ok: true };
}
