// Unified append-only audit log (audit_events). Unlike domain-specific audit
// tables (message_audit, inventory_audit, global_announcement_audit), this is a
// single cross-cutting activity feed for security-relevant events: logins, role
// changes, price/product edits, and store switches.
//
// actorId/storeId deliberately have NO foreign keys so that (a) failed-login
// events can reference an unknown/absent user, and (b) events survive user or
// store deletion for compliance retention.

import { getDB } from '../sqlite';
import { nowISO, type AuditAction, type AuditEvent } from '../../types';
import { newId } from '../../ids';
import { writeTx } from './_tx';

export interface RecordAuditInput {
  storeId?: string | null;
  actorId?: string | null;
  actorEmail?: string | null;
  action: AuditAction;
  entityType?: string | null;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
  ip?: string | null;
}

function auditOutbox(event: AuditEvent) {
  return { op: 'upsert' as const, collection: 'AuditEvent', docId: event.id, payload: event };
}

export const auditRepo = {
  record(input: RecordAuditInput): AuditEvent {
    return writeTx((d) => {
      const event: AuditEvent = {
        id: newId(),
        storeId: input.storeId ?? null,
        actorId: input.actorId ?? null,
        actorEmail: input.actorEmail ?? null,
        action: input.action,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        metadataJson: JSON.stringify(input.metadata ?? {}),
        ip: input.ip ?? null,
        createdAt: nowISO(),
      };
      d.prepare(
        `INSERT INTO audit_events(id,storeId,actorId,actorEmail,action,entityType,entityId,metadataJson,ip,createdAt)
         VALUES(?,?,?,?,?,?,?,?,?,?)`,
      ).run(
        event.id,
        event.storeId,
        event.actorId,
        event.actorEmail,
        event.action,
        event.entityType,
        event.entityId,
        event.metadataJson,
        event.ip,
        event.createdAt,
      );
      return { result: event, outbox: [auditOutbox(event)] };
    });
  },

  /** Store-scoped feed (manager view). */
  listForStore(storeId: string, limit = 100): AuditEvent[] {
    return getDB()
      .prepare<[string, number], AuditEvent>(
        'SELECT * FROM audit_events WHERE storeId=? ORDER BY createdAt DESC LIMIT ?',
      )
      .all(storeId, Math.min(Math.max(limit, 1), 500));
  },

  /** Platform-wide feed (root view). */
  listAll(limit = 200): AuditEvent[] {
    return getDB()
      .prepare<[number], AuditEvent>(
        'SELECT * FROM audit_events ORDER BY createdAt DESC LIMIT ?',
      )
      .all(Math.min(Math.max(limit, 1), 500));
  },
};
