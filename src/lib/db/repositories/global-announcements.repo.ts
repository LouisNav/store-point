import { getDB } from '../sqlite';
import { nowISO, type GlobalAnnouncement, type GlobalAnnouncementAcknowledgment, type GlobalAnnouncementAudit, type GlobalAnnouncementPriority } from '../../types';
import { newId } from '../../ids';
import { writeTx } from './_tx';

function announcementOutbox(announcement: GlobalAnnouncement) {
  return { op: 'upsert' as const, collection: 'GlobalAnnouncement', docId: announcement.id, payload: announcement };
}

function acknowledgmentOutbox(ack: GlobalAnnouncementAcknowledgment) {
  return { op: 'upsert' as const, collection: 'GlobalAnnouncementAcknowledgment', docId: `${ack.announcementId}:${ack.userId}`, payload: ack };
}

function auditOutbox(audit: GlobalAnnouncementAudit) {
  return { op: 'upsert' as const, collection: 'GlobalAnnouncementAudit', docId: audit.id, payload: audit };
}

function addAudit(d: import('better-sqlite3').Database, input: Omit<GlobalAnnouncementAudit, 'id' | 'createdAt'>): GlobalAnnouncementAudit {
  const audit: GlobalAnnouncementAudit = { ...input, id: newId(), createdAt: nowISO() };
  d.prepare(
    `INSERT INTO global_announcement_audit(id,announcementId,actorId,action,metadataJson,createdAt)
     VALUES(?,?,?,?,?,?)`,
  ).run(audit.id, audit.announcementId, audit.actorId, audit.action, audit.metadataJson, audit.createdAt);
  return audit;
}

function activeAnnouncementQuery() {
  return `SELECT * FROM global_announcements
    WHERE deletedAt IS NULL AND publishedAt <= ? AND (expiresAt IS NULL OR expiresAt > ?)`;
}

export const globalAnnouncementsRepo = {
  list(limit = 100): GlobalAnnouncement[] {
    return getDB().prepare<[number], GlobalAnnouncement>(
      'SELECT * FROM global_announcements WHERE deletedAt IS NULL ORDER BY publishedAt DESC LIMIT ?',
    ).all(Math.min(Math.max(limit, 1), 500));
  },

  active(limit = 20): GlobalAnnouncement[] {
    const now = nowISO();
    return getDB().prepare<[string, string, number], GlobalAnnouncement>(
      `${activeAnnouncementQuery()} ORDER BY publishedAt DESC LIMIT ?`,
    ).all(now, now, Math.min(Math.max(limit, 1), 100));
  },

  activeForUser(userId: string, limit = 20): GlobalAnnouncement[] {
    const d = getDB();
    const membership = d.prepare<[string], { storeId: string }>(
      'SELECT storeId FROM memberships WHERE userId=? AND active=1 AND deletedAt IS NULL LIMIT 1',
    ).get(userId);
    const root = d.prepare<[string], { isRoot: 0 | 1 }>(
      'SELECT isRoot FROM users WHERE id=? AND deletedAt IS NULL',
    ).get(userId);
    if (!membership && root?.isRoot !== 1) return [];
    return this.active(limit);
  },

  create(input: {
    title: string;
    body: string;
    priority: GlobalAnnouncementPriority;
    requiresAck: boolean;
    createdById: string;
    expiresAt?: string | null;
  }): GlobalAnnouncement {
    return writeTx((d) => {
      const now = nowISO();
      const announcement: GlobalAnnouncement = {
        id: newId(),
        title: input.title.trim(),
        body: input.body.trim(),
        priority: input.priority,
        requiresAck: input.requiresAck ? 1 : 0,
        createdById: input.createdById,
        publishedAt: now,
        expiresAt: input.expiresAt ?? null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      };
      d.prepare(
        `INSERT INTO global_announcements(id,title,body,priority,requiresAck,createdById,publishedAt,expiresAt,createdAt,updatedAt)
         VALUES(?,?,?,?,?,?,?,?,?,?)`,
      ).run(announcement.id, announcement.title, announcement.body, announcement.priority, announcement.requiresAck, announcement.createdById, announcement.publishedAt, announcement.expiresAt, announcement.createdAt, announcement.updatedAt);
      const audit = addAudit(d, {
        announcementId: announcement.id,
        actorId: input.createdById,
        action: 'created',
        metadataJson: JSON.stringify({ priority: announcement.priority, requiresAck: announcement.requiresAck }),
      });
      return { result: announcement, outbox: [announcementOutbox(announcement), auditOutbox(audit)] };
    });
  },

  acknowledge(announcementId: string, userId: string, storeId: string): GlobalAnnouncementAcknowledgment | undefined {
    return writeTx((d) => {
      const now = nowISO();
      const announcement = d.prepare<[string, string, string], GlobalAnnouncement>(
        `${activeAnnouncementQuery()} AND id=?`,
      ).get(now, now, announcementId);
      if (!announcement || !announcement.requiresAck) return { result: undefined, outbox: [] };
      const member = d.prepare<[string, string], { userId: string }>(
        'SELECT userId FROM memberships WHERE userId=? AND storeId=? AND active=1 AND deletedAt IS NULL',
      ).get(userId, storeId);
      const root = d.prepare<[string], { isRoot: 0 | 1 }>(
        'SELECT isRoot FROM users WHERE id=? AND deletedAt IS NULL',
      ).get(userId);
      if (!member && root?.isRoot !== 1) return { result: undefined, outbox: [] };
      const existing = d.prepare<[string, string], GlobalAnnouncementAcknowledgment>(
        'SELECT * FROM global_announcement_acknowledgments WHERE announcementId=? AND userId=?',
      ).get(announcementId, userId);
      if (existing) return { result: existing, outbox: [] };
      const ack: GlobalAnnouncementAcknowledgment = { announcementId, userId, storeId, acknowledgedAt: now };
      d.prepare(
        `INSERT INTO global_announcement_acknowledgments(announcementId,userId,storeId,acknowledgedAt)
         VALUES(?,?,?,?)`,
      ).run(ack.announcementId, ack.userId, ack.storeId, ack.acknowledgedAt);
      const audit = addAudit(d, {
        announcementId,
        actorId: userId,
        action: 'acknowledged',
        metadataJson: JSON.stringify({ storeId }),
      });
      return { result: ack, outbox: [acknowledgmentOutbox(ack), auditOutbox(audit)] };
    });
  },

  hasAcknowledged(announcementId: string, userId: string): boolean {
    return !!getDB().prepare<[string, string], GlobalAnnouncementAcknowledgment>(
      'SELECT * FROM global_announcement_acknowledgments WHERE announcementId=? AND userId=?',
    ).get(announcementId, userId);
  },

  acknowledgmentCount(announcementId: string): number {
    const row = getDB().prepare<[string], { count: number }>(
      'SELECT COUNT(*) AS count FROM global_announcement_acknowledgments WHERE announcementId=?',
    ).get(announcementId);
    return row?.count ?? 0;
  },

  since(since: string, until: string, limit = 50): GlobalAnnouncement[] {
    return getDB().prepare<[string, string, string, number], GlobalAnnouncement>(
      `SELECT * FROM global_announcements
       WHERE deletedAt IS NULL AND publishedAt>? AND publishedAt<=?
         AND (expiresAt IS NULL OR expiresAt>?)
       ORDER BY publishedAt ASC LIMIT ?`,
    ).all(since, until, until, Math.min(Math.max(limit, 1), 100));
  },

  audit(limit = 100): GlobalAnnouncementAudit[] {
    return getDB().prepare<[number], GlobalAnnouncementAudit>(
      'SELECT * FROM global_announcement_audit ORDER BY createdAt DESC LIMIT ?',
    ).all(Math.min(Math.max(limit, 1), 500));
  },
};
