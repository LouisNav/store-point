// Store-scoped messaging repository.
// Every method takes storeId so callers cannot accidentally cross a tenant boundary.

import { getDB } from '../sqlite';
import { nowISO, type Channel, type ChannelKind, type ChannelRead, type DirectConversation, type Message, type MessageAcknowledgment, type MessageAudit, type MessageAuditAction, type MessageRevision, type UnreadSummary } from '../../types';
import { newId } from '../../ids';
import { writeTx } from './_tx';

interface RawMessage extends Omit<Message, 'reactions'> {
  reactionsJson: string;
}

interface RawChannelRead extends ChannelRead {}

function parseReactions(value: string): Record<string, string[]> {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).flatMap(([emoji, users]) => {
        if (!Array.isArray(users)) return [];
        const ids = users.filter((id): id is string => typeof id === 'string');
        return ids.length ? [[emoji, ids]] : [];
      }),
    );
  } catch {
    return {};
  }
}

function toMessage(row: RawMessage): Message {
  return {
    ...row,
    reactions: parseReactions(row.reactionsJson),
  };
}

function assertActiveMember(d: import('better-sqlite3').Database, storeId: string, userId: string) {
  const member = d.prepare<[string, string], { userId: string }>(
    'SELECT userId FROM memberships WHERE storeId=? AND userId=? AND active=1 AND deletedAt IS NULL',
  ).get(storeId, userId);
  if (!member) throw new Error('User is not an active member of this store.');
}

function isDirectParticipant(d: import('better-sqlite3').Database, storeId: string, channelId: string, userId: string): boolean {
  return !!d.prepare<[string, string, string], { channelId: string }>(
    `SELECT p.channelId FROM channel_participants p
     JOIN channels c ON c.id=p.channelId AND c.storeId=p.storeId AND c.kind='direct' AND c.deletedAt IS NULL
     WHERE p.storeId=? AND p.channelId=? AND p.userId=?`,
  ).get(storeId, channelId, userId);
}

function addAudit(
  d: import('better-sqlite3').Database,
  input: {
    storeId: string;
    messageId?: string | null;
    channelId?: string | null;
    actorId: string;
    action: MessageAuditAction;
    metadata?: Record<string, unknown>;
  },
): MessageAudit {
  const audit: MessageAudit = {
    id: newId(),
    storeId: input.storeId,
    messageId: input.messageId ?? null,
    channelId: input.channelId ?? null,
    actorId: input.actorId,
    action: input.action,
    metadataJson: JSON.stringify(input.metadata ?? {}),
    createdAt: nowISO(),
  };
  d.prepare(
    `INSERT INTO message_audit(id,storeId,messageId,channelId,actorId,action,metadataJson,createdAt)
     VALUES(?,?,?,?,?,?,?,?)`,
  ).run(
    audit.id,
    audit.storeId,
    audit.messageId,
    audit.channelId,
    audit.actorId,
    audit.action,
    audit.metadataJson,
    audit.createdAt,
  );
  return audit;
}

function channelOutbox(channel: Channel) {
  return { op: 'upsert' as const, collection: 'Channel', docId: channel.id, payload: channel };
}
function messageOutbox(message: Message) {
  return {
    op: 'upsert' as const,
    collection: 'Message',
    docId: message.id,
    payload: { ...message, reactionsJson: JSON.stringify(message.reactions) },
  };
}
function auditOutbox(audit: MessageAudit) {
  return { op: 'upsert' as const, collection: 'MessageAudit', docId: audit.id, payload: audit };
}
function revisionOutbox(revision: MessageRevision) {
  return { op: 'upsert' as const, collection: 'MessageRevision', docId: revision.id, payload: revision };
}
function acknowledgmentOutbox(ack: MessageAcknowledgment) {
  return { op: 'upsert' as const, collection: 'MessageAcknowledgment', docId: `${ack.messageId}:${ack.userId}`, payload: ack };
}
function participantOutbox(participant: { channelId: string; storeId: string; userId: string; createdAt: string }) {
  return { op: 'upsert' as const, collection: 'ChannelParticipant', docId: `${participant.channelId}:${participant.userId}`, payload: participant };
}

export const messagingRepo = {
  /** Create the two operational channels on first use, idempotently. */
  ensureDefaultChannels(storeId: string, createdById: string): Channel[] {
    const existing = this.listChannels(storeId);
    const defaults: Array<{ slug: string; name: string; description: string; kind: ChannelKind }> = [
      { slug: 'general', name: 'General', description: 'Day-to-day coordination for this store.', kind: 'general' },
      { slug: 'announcements', name: 'Announcements', description: 'Important updates from store leadership.', kind: 'announcement' },
    ];
    for (const item of defaults) {
      if (existing.some((channel) => channel.slug === item.slug)) continue;
      const channel: Channel = {
        id: newId(),
        storeId,
        slug: item.slug,
        name: item.name,
        description: item.description,
        kind: item.kind,
        createdById,
        createdAt: nowISO(),
        updatedAt: nowISO(),
        deletedAt: null,
      };
      writeTx((d) => {
        const prior = d.prepare<[string, string], Channel>('SELECT * FROM channels WHERE storeId=? AND slug=?').get(storeId, item.slug);
        if (prior?.deletedAt) {
          const restored: Channel = { ...prior, deletedAt: null, updatedAt: nowISO() };
          d.prepare('UPDATE channels SET deletedAt=NULL, updatedAt=? WHERE id=? AND storeId=?').run(restored.updatedAt, restored.id, storeId);
          return { result: restored, outbox: [channelOutbox(restored)] };
        }
        if (prior) return { result: prior, outbox: [] };
        d.prepare(
          `INSERT INTO channels(id,storeId,slug,name,description,kind,createdById,createdAt,updatedAt)
           VALUES(?,?,?,?,?,?,?,?,?)`,
        ).run(channel.id, channel.storeId, channel.slug, channel.name, channel.description, channel.kind, channel.createdById, channel.createdAt, channel.updatedAt);
        return { result: channel, outbox: [channelOutbox(channel)] };
      });
    }
    return this.listChannels(storeId);
  },

  listChannels(storeId: string): Channel[] {
    return getDB()
      .prepare<[string], Channel>(
        `SELECT * FROM channels WHERE storeId=? AND deletedAt IS NULL AND kind <> 'direct' ORDER BY CASE kind WHEN 'announcement' THEN 0 ELSE 1 END, createdAt ASC`,
      )
      .all(storeId);
  },

  byId(storeId: string, channelId: string): Channel | undefined {
    return getDB()
      .prepare<[string, string], Channel>('SELECT * FROM channels WHERE storeId=? AND id=? AND deletedAt IS NULL')
      .get(storeId, channelId);
  },

  isParticipant(storeId: string, channelId: string, userId: string): boolean {
    return !!getDB().prepare<[string, string, string], { channelId: string }>(
      `SELECT p.channelId FROM channel_participants p
       JOIN channels c ON c.id=p.channelId AND c.storeId=p.storeId AND c.kind='direct' AND c.deletedAt IS NULL
       WHERE p.storeId=? AND p.channelId=? AND p.userId=?`,
    ).get(storeId, channelId, userId);
  },

  createDirectConversation(storeId: string, firstUserId: string, secondUserId: string): Channel {
    if (firstUserId === secondUserId) throw new Error('A direct conversation needs two different people.');
    const [userA, userB] = [firstUserId, secondUserId].sort();
    const directKey = `${userA}:${userB}`;
    return writeTx((d) => {
      const existing = d.prepare<[string, string], Channel>(
        'SELECT * FROM channels WHERE storeId=? AND directKey=? AND deletedAt IS NULL',
      ).get(storeId, directKey);
      if (existing) return { result: existing, outbox: [] };
      const members = d.prepare<[string, string, string], { count: number }>(
        `SELECT COUNT(*) AS count FROM memberships
         WHERE storeId=? AND userId IN (?,?) AND active=1 AND deletedAt IS NULL`,
      ).get(storeId, userA, userB);
      if (!members || members.count !== 2) throw new Error('Both people must be active members of this store.');
      const now = nowISO();
      const channel: Channel = {
        id: newId(),
        storeId,
        slug: `direct-${directKey}`,
        directKey,
        name: 'Direct message',
        description: 'Private conversation between two store members.',
        kind: 'direct',
        createdById: firstUserId,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      };
      const participants = [userA, userB].map((userId) => ({ channelId: channel.id, storeId, userId, createdAt: now }));
      d.prepare(
        `INSERT INTO channels(id,storeId,slug,directKey,name,description,kind,createdById,createdAt,updatedAt)
         VALUES(?,?,?,?,?,?,?,?,?,?)`,
      ).run(channel.id, channel.storeId, channel.slug, channel.directKey, channel.name, channel.description, channel.kind, channel.createdById, channel.createdAt, channel.updatedAt);
      for (const participant of participants) {
        d.prepare('INSERT INTO channel_participants(channelId,storeId,userId,createdAt) VALUES(?,?,?,?)').run(participant.channelId, participant.storeId, participant.userId, participant.createdAt);
      }
      return { result: channel, outbox: [channelOutbox(channel), ...participants.map(participantOutbox)] };
    });
  },

  listDirectConversations(storeId: string, userId: string): DirectConversation[] {
    const active = getDB().prepare<[string, string], { userId: string }>(
      'SELECT userId FROM memberships WHERE storeId=? AND userId=? AND active=1 AND deletedAt IS NULL',
    ).get(storeId, userId);
    if (!active) return [];
    const rows = getDB().prepare<[string, string, string, string, string], Channel & { unread: number; partnerId: string; partnerName: string; partnerEmail: string; lastMessageBody: string | null; lastMessageAt: string | null }>(
      `SELECT c.*, u.id AS partnerId, u.name AS partnerName, u.email AS partnerEmail,
         COUNT(CASE WHEN m.authorId<>? AND (r.lastReadAt IS NULL OR m.createdAt > r.lastReadAt) THEN 1 END) AS unread,
         (SELECT body FROM messages lm WHERE lm.channelId=c.id AND lm.storeId=c.storeId AND lm.deletedAt IS NULL ORDER BY lm.createdAt DESC LIMIT 1) AS lastMessageBody,
         (SELECT createdAt FROM messages lm WHERE lm.channelId=c.id AND lm.storeId=c.storeId AND lm.deletedAt IS NULL ORDER BY lm.createdAt DESC LIMIT 1) AS lastMessageAt
       FROM channels c
       JOIN channel_participants mine ON mine.channelId=c.id AND mine.storeId=c.storeId AND mine.userId=?
       JOIN channel_participants other ON other.channelId=c.id AND other.storeId=c.storeId AND other.userId<>?
       JOIN users u ON u.id=other.userId AND u.deletedAt IS NULL
       LEFT JOIN channel_reads r ON r.channelId=c.id AND r.userId=?
       LEFT JOIN messages m ON m.channelId=c.id AND m.storeId=c.storeId AND m.deletedAt IS NULL
       WHERE c.storeId=? AND c.kind='direct' AND c.deletedAt IS NULL
       GROUP BY c.id, u.id
       ORDER BY COALESCE(lastMessageAt, c.createdAt) DESC`,
    ).all(userId, userId, userId, userId, storeId);
    return rows.map((row) => ({
      channel: row,
      partnerId: row.partnerId,
      partnerName: row.partnerName,
      partnerEmail: row.partnerEmail,
      unread: Number(row.unread ?? 0),
      lastMessageBody: row.lastMessageBody,
      lastMessageAt: row.lastMessageAt,
    }));
  },

  listMessages(storeId: string, channelId: string, options?: { search?: string; limit?: number }, userId?: string): Message[] {
    const channel = this.byId(storeId, channelId);
    if (!channel || (channel.kind === 'direct' && (!userId || !this.isParticipant(storeId, channelId, userId)))) return [];
    const limit = Math.min(Math.max(options?.limit ?? 120, 1), 200);
    const search = options?.search?.trim();
    const rows = search
      ? getDB().prepare<[string, string, string, number], RawMessage>(
          `SELECT * FROM messages
           WHERE storeId=? AND channelId=? AND deletedAt IS NULL AND body LIKE ?
           ORDER BY createdAt DESC LIMIT ?`,
        ).all(storeId, channelId, `%${search}%`, limit)
      : getDB().prepare<[string, string, number], RawMessage>(
          `SELECT * FROM messages WHERE storeId=? AND channelId=? AND deletedAt IS NULL
           ORDER BY createdAt DESC LIMIT ?`,
        ).all(storeId, channelId, limit);
    return rows.map(toMessage).reverse();
  },

  byIdMessage(storeId: string, messageId: string, userId?: string): Message | undefined {
    const d = getDB();
    const row = d
      .prepare<[string, string], RawMessage>('SELECT * FROM messages WHERE storeId=? AND id=? AND deletedAt IS NULL')
      .get(storeId, messageId);
    if (!row) return undefined;
    const message = toMessage(row);
    const channel = d.prepare<[string, string], Channel>('SELECT * FROM channels WHERE storeId=? AND id=? AND deletedAt IS NULL').get(storeId, message.channelId);
    if (channel?.kind === 'direct' && (!userId || !isDirectParticipant(d, storeId, message.channelId, userId))) return undefined;
    return message;
  },

  createMessage(input: {
    storeId: string;
    channelId: string;
    authorId: string;
    body: string;
    parentId?: string | null;
    requiresAck?: boolean;
  }): Message {
    return writeTx((d) => {
      const channel = d.prepare<[string, string], Channel>('SELECT * FROM channels WHERE storeId=? AND id=? AND deletedAt IS NULL').get(input.storeId, input.channelId);
      if (!channel) throw new Error('Channel does not belong to this store.');
      assertActiveMember(d, input.storeId, input.authorId);
      if (channel.kind === 'direct' && !isDirectParticipant(d, input.storeId, input.channelId, input.authorId)) {
        throw new Error('Author is not a participant in this conversation.');
      }
      if (input.parentId) {
        const parent = d.prepare<[string, string, string], { id: string }>(
          'SELECT id FROM messages WHERE id=? AND storeId=? AND channelId=? AND deletedAt IS NULL',
        ).get(input.parentId, input.storeId, input.channelId);
        if (!parent) throw new Error('Thread parent does not belong to this channel.');
      }
      const now = nowISO();
      const message: Message = {
        id: newId(),
        storeId: input.storeId,
        channelId: input.channelId,
        authorId: input.authorId,
        parentId: input.parentId ?? null,
        body: input.body,
        reactions: {},
        pinned: 0,
        requiresAck: input.requiresAck ? 1 : 0,
        editedAt: null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      };
      d.prepare(
        `INSERT INTO messages(id,storeId,channelId,authorId,parentId,body,reactionsJson,pinned,requiresAck,editedAt,createdAt,updatedAt)
         VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
      ).run(message.id, message.storeId, message.channelId, message.authorId, message.parentId, message.body, '{}', message.pinned, message.requiresAck, message.editedAt, message.createdAt, message.updatedAt);
      const revision: MessageRevision = { id: `${message.id}:v1`, storeId: message.storeId, messageId: message.id, version: 1, body: message.body, revisedById: message.authorId, createdAt: now };
      d.prepare(
        `INSERT INTO message_revisions(id,storeId,messageId,version,body,revisedById,createdAt)
         VALUES(?,?,?,?,?,?,?)`,
      ).run(revision.id, revision.storeId, revision.messageId, revision.version, revision.body, revision.revisedById, revision.createdAt);
      const audit = addAudit(d, { storeId: message.storeId, messageId: message.id, channelId: message.channelId, actorId: message.authorId, action: 'created', metadata: { parentId: message.parentId } });
      return { result: message, outbox: [messageOutbox(message), revisionOutbox(revision), auditOutbox(audit)] };
    });
  },

  editMessage(storeId: string, messageId: string, body: string, actorId: string): Message | undefined {
    return writeTx((d) => {
      const current = d.prepare<[string, string], RawMessage>('SELECT * FROM messages WHERE storeId=? AND id=? AND deletedAt IS NULL').get(storeId, messageId);
      if (!current) return { result: undefined, outbox: [] };
      assertActiveMember(d, storeId, actorId);
      const message = toMessage(current);
      if (message.authorId !== actorId) throw new Error('Only the original author may edit a message.');
      if (message.body === body) return { result: message, outbox: [] };
      const seenAt = this.seenAtByOtherInTransaction(d, storeId, messageId, actorId);
      if (seenAt) throw new Error('This message has already been seen and is now locked from editing.');
      const versionRow = d.prepare<[string], { version: number }>(
        'SELECT COALESCE(MAX(version), 0) AS version FROM message_revisions WHERE messageId=?',
      ).get(messageId);
      const nextVersion = Number(versionRow?.version ?? 0) + 1;
      const editedAt = nowISO();
      const next: Message = { ...message, body, editedAt, updatedAt: editedAt };
      const revision: MessageRevision = { id: `${message.id}:v${nextVersion}`, storeId, messageId, version: nextVersion, body, revisedById: actorId, createdAt: editedAt };
      d.prepare('INSERT INTO message_revisions(id,storeId,messageId,version,body,revisedById,createdAt) VALUES(?,?,?,?,?,?,?)').run(revision.id, revision.storeId, revision.messageId, revision.version, revision.body, revision.revisedById, revision.createdAt);
      d.prepare('UPDATE messages SET body=?, editedAt=?, updatedAt=? WHERE storeId=? AND id=?').run(next.body, next.editedAt, next.updatedAt, storeId, messageId);
      const audit = addAudit(d, { storeId, messageId, channelId: next.channelId, actorId, action: 'edited', metadata: { version: nextVersion } });
      return { result: next, outbox: [messageOutbox(next), revisionOutbox(revision), auditOutbox(audit)] };
    });
  },

  deleteMessage(storeId: string, messageId: string, actorId: string): boolean {
    return writeTx((d) => {
      const current = d.prepare<[string, string], RawMessage>('SELECT * FROM messages WHERE storeId=? AND id=? AND deletedAt IS NULL').get(storeId, messageId);
      if (!current) return { result: false, outbox: [] };
      assertActiveMember(d, storeId, actorId);
      const channel = d.prepare<[string, string], Channel>('SELECT * FROM channels WHERE storeId=? AND id=? AND deletedAt IS NULL').get(storeId, current.channelId);
      if (channel?.kind === 'direct' && !isDirectParticipant(d, storeId, current.channelId, actorId)) return { result: false, outbox: [] };
      const deletedAt = nowISO();
      d.prepare('UPDATE messages SET deletedAt=?, updatedAt=? WHERE storeId=? AND id=?').run(deletedAt, deletedAt, storeId, messageId);
      const payload = { ...toMessage(current), deletedAt, updatedAt: deletedAt };
      const audit = addAudit(d, { storeId, messageId, channelId: current.channelId, actorId, action: 'deleted' });
      return {
        result: true,
        outbox: [
          { op: 'soft_delete' as const, collection: 'Message', docId: messageId, payload },
          auditOutbox(audit),
        ],
      };
    });
  },

  toggleReaction(storeId: string, messageId: string, actorId: string, emoji: string): Message | undefined {
    return writeTx((d) => {
      const current = d.prepare<[string, string], RawMessage>('SELECT * FROM messages WHERE storeId=? AND id=? AND deletedAt IS NULL').get(storeId, messageId);
      if (!current) return { result: undefined, outbox: [] };
      assertActiveMember(d, storeId, actorId);
      const channel = d.prepare<[string, string], Channel>('SELECT * FROM channels WHERE storeId=? AND id=? AND deletedAt IS NULL').get(storeId, current.channelId);
      if (channel?.kind === 'direct' && !isDirectParticipant(d, storeId, current.channelId, actorId)) return { result: undefined, outbox: [] };
      const message = toMessage(current);
      const users = new Set(message.reactions[emoji] ?? []);
      const added = !users.has(actorId);
      if (added) users.add(actorId); else users.delete(actorId);
      const reactions = { ...message.reactions };
      if (users.size) reactions[emoji] = [...users]; else delete reactions[emoji];
      const next: Message = { ...message, reactions, updatedAt: nowISO() };
      d.prepare('UPDATE messages SET reactionsJson=?, updatedAt=? WHERE storeId=? AND id=?').run(JSON.stringify(reactions), next.updatedAt, storeId, messageId);
      const audit = addAudit(d, { storeId, messageId, channelId: next.channelId, actorId, action: added ? 'reaction_added' : 'reaction_removed', metadata: { emoji } });
      return { result: next, outbox: [messageOutbox(next), auditOutbox(audit)] };
    });
  },

  togglePin(storeId: string, messageId: string, actorId: string): Message | undefined {
    return writeTx((d) => {
      const current = d.prepare<[string, string], RawMessage>('SELECT * FROM messages WHERE storeId=? AND id=? AND deletedAt IS NULL').get(storeId, messageId);
      if (!current) return { result: undefined, outbox: [] };
      assertActiveMember(d, storeId, actorId);
      const channel = d.prepare<[string, string], Channel>('SELECT * FROM channels WHERE storeId=? AND id=? AND deletedAt IS NULL').get(storeId, current.channelId);
      if (channel?.kind === 'direct' && !isDirectParticipant(d, storeId, current.channelId, actorId)) return { result: undefined, outbox: [] };
      const message = toMessage(current);
      const next: Message = { ...message, pinned: message.pinned ? 0 : 1, updatedAt: nowISO() };
      d.prepare('UPDATE messages SET pinned=?, updatedAt=? WHERE storeId=? AND id=?').run(next.pinned, next.updatedAt, storeId, messageId);
      const audit = addAudit(d, { storeId, messageId, channelId: next.channelId, actorId, action: next.pinned ? 'pinned' : 'unpinned' });
      return { result: next, outbox: [messageOutbox(next), auditOutbox(audit)] };
    });
  },

  markRead(storeId: string, channelId: string, userId: string, lastReadAt = nowISO()): void {
    const channel = this.byId(storeId, channelId);
    if (!channel) return;
    const d = getDB();
    const active = d.prepare<[string, string], { userId: string }>(
      'SELECT userId FROM memberships WHERE storeId=? AND userId=? AND active=1 AND deletedAt IS NULL',
    ).get(storeId, userId);
    if (!active || (channel.kind === 'direct' && !this.isParticipant(storeId, channelId, userId))) return;
    const updatedAt = nowISO();
    getDB().prepare(
      `INSERT INTO channel_reads(channelId,userId,lastReadAt,updatedAt) VALUES(?,?,?,?)
       ON CONFLICT(channelId,userId) DO UPDATE SET lastReadAt=excluded.lastReadAt, updatedAt=excluded.updatedAt
       WHERE excluded.lastReadAt > channel_reads.lastReadAt`,
    ).run(channelId, userId, lastReadAt, updatedAt);
  },

  unreadSummary(storeId: string, userId: string): UnreadSummary {
    const rows = getDB().prepare<[string, string, string], { channelId: string; unread: number }>(
      `SELECT c.id AS channelId, COUNT(m.id) AS unread
       FROM channels c
       LEFT JOIN channel_reads r ON r.channelId=c.id AND r.userId=?
       LEFT JOIN messages m ON m.channelId=c.id AND m.storeId=c.storeId AND m.deletedAt IS NULL
         AND m.authorId<>? AND (r.lastReadAt IS NULL OR m.createdAt > r.lastReadAt)
       WHERE c.storeId=? AND c.deletedAt IS NULL AND c.kind <> 'direct'
       GROUP BY c.id`,
    ).all(userId, userId, storeId);
    const direct = this.listDirectConversations(storeId, userId).map((conversation) => ({ channelId: conversation.channel.id, unread: conversation.unread }));
    const channels = [...rows, ...direct];
    return { total: channels.reduce((sum, row) => sum + row.unread, 0), channels };
  },

  acknowledgmentCount(storeId: string, messageId: string): number {
    const row = getDB().prepare<[string, string], { count: number }>(
      `SELECT COUNT(*) AS count FROM message_acknowledgments a
       JOIN messages m ON m.id=a.messageId AND m.storeId=?
       WHERE a.messageId=?`,
    ).get(storeId, messageId);
    return row?.count ?? 0;
  },

  acknowledge(storeId: string, messageId: string, userId: string): MessageAcknowledgment | undefined {
    return writeTx((d) => {
      const current = d.prepare<[string, string], RawMessage>('SELECT * FROM messages WHERE storeId=? AND id=? AND deletedAt IS NULL').get(storeId, messageId);
      if (!current || !current.requiresAck) return { result: undefined, outbox: [] };
      const channel = d.prepare<[string, string], Channel>('SELECT * FROM channels WHERE storeId=? AND id=? AND deletedAt IS NULL').get(storeId, current.channelId);
      if (!channel || channel.kind !== 'announcement') return { result: undefined, outbox: [] };
      assertActiveMember(d, storeId, userId);
      const existing = d.prepare<[string, string], MessageAcknowledgment>(
        'SELECT * FROM message_acknowledgments WHERE messageId=? AND userId=?',
      ).get(messageId, userId);
      if (existing) return { result: existing, outbox: [] };
      const ack: MessageAcknowledgment = { messageId, userId, acknowledgedAt: nowISO() };
      d.prepare(
        `INSERT INTO message_acknowledgments(messageId,userId,acknowledgedAt) VALUES(?,?,?)`,
      ).run(ack.messageId, ack.userId, ack.acknowledgedAt);
      const audit = addAudit(d, { storeId, messageId, channelId: channel.id, actorId: userId, action: 'acknowledged' });
      return { result: ack, outbox: [acknowledgmentOutbox(ack), auditOutbox(audit)] };
    });
  },

  seenAtByOtherInTransaction(d: import('better-sqlite3').Database, storeId: string, messageId: string, actorId: string): string | null {
    const row = d.prepare<[string, string, string, string, string, string], { seenAt: string | null }>(
      `SELECT MIN(seenAt) AS seenAt FROM (
         SELECT a.acknowledgedAt AS seenAt
         FROM message_acknowledgments a
         JOIN messages m ON m.id=a.messageId AND m.storeId=?
         WHERE a.messageId=? AND a.userId<>?
         UNION ALL
         SELECT r.lastReadAt AS seenAt
         FROM channel_reads r
         JOIN messages m ON m.channelId=r.channelId AND m.storeId=? AND m.id=?
         WHERE r.userId<>? AND r.lastReadAt >= m.createdAt
       )`,
    ).get(storeId, messageId, actorId, storeId, messageId, actorId);
    return row?.seenAt ?? null;
  },

  hasBeenSeenByOther(storeId: string, messageId: string, actorId: string): boolean {
    return !!this.seenAtByOtherInTransaction(getDB(), storeId, messageId, actorId);
  },

  hasAcknowledged(messageId: string, userId: string): boolean {
    return !!getDB().prepare<[string, string], MessageAcknowledgment>(
      'SELECT * FROM message_acknowledgments WHERE messageId=? AND userId=?',
    ).get(messageId, userId);
  },

  listRevisions(storeId: string, messageId: string): MessageRevision[] {
    return getDB().prepare<[string, string], MessageRevision>(
      'SELECT * FROM message_revisions WHERE storeId=? AND messageId=? ORDER BY version ASC',
    ).all(storeId, messageId);
  },

  auditForStore(storeId: string, limit = 100): MessageAudit[] {
    return getDB().prepare<[string, number], MessageAudit>(
      'SELECT * FROM message_audit WHERE storeId=? ORDER BY createdAt DESC LIMIT ?',
    ).all(storeId, Math.min(Math.max(limit, 1), 500));
  },

  readState(storeId: string, channelId: string, userId: string): ChannelRead | undefined {
    if (!this.byId(storeId, channelId)) return undefined;
    return getDB().prepare<[string, string], RawChannelRead>(
      'SELECT * FROM channel_reads WHERE channelId=? AND userId=?',
    ).get(channelId, userId);
  },
};
