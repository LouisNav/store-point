/** Isolated smoke test for the store-scoped messaging primitives. */
import fs from 'node:fs';
import path from 'node:path';

const dbPath = path.resolve(process.cwd(), './data/messaging-test.db');
process.env.SQLITE_PATH = dbPath;
process.env.SESSION_PASSWORD = process.env.SESSION_PASSWORD ?? '12345678901234567890123456789012';
for (const suffix of ['', '-wal', '-shm']) {
  try { fs.unlinkSync(dbPath + suffix); } catch { /* already absent */ }
}

import { closeDB, getDB } from '../src/lib/db/sqlite';
import { usersRepo } from '../src/lib/db/repositories/users.repo';
import { storesRepo } from '../src/lib/db/repositories/stores.repo';
import { membershipsRepo } from '../src/lib/db/repositories/memberships.repo';
import { messagingRepo } from '../src/lib/db/repositories/messaging.repo';
import { outboxRepo } from '../src/lib/db/repositories/outbox.repo';
import { notificationsRepo } from '../src/lib/db/repositories/notifications.repo';
import { globalAnnouncementsRepo } from '../src/lib/db/repositories/global-announcements.repo';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main() {
  getDB();
  try {
    const owner = await usersRepo.create({ email: 'messaging-owner@example.com', name: 'Owner', password: 'TestPass!123', isRoot: true });
    const teammate = await usersRepo.create({ email: 'messaging-teammate@example.com', name: 'Teammate', password: 'TestPass!123' });
    const store = storesRepo.create({ slug: 'messaging-test', name: 'Messaging Test' });
    const otherStore = storesRepo.create({ slug: 'messaging-other', name: 'Other Store' });
    membershipsRepo.upsert(owner.id, store.id, 'ROOT_ADMIN');
    membershipsRepo.upsert(teammate.id, store.id, 'SALES_AGENT');
    membershipsRepo.upsert(owner.id, otherStore.id, 'ROOT_ADMIN');

    const channels = messagingRepo.ensureDefaultChannels(store.id, owner.id);
    assert(channels.length === 2, 'expected General and Announcements channels');
    const general = channels.find((channel) => channel.slug === 'general')!;
    const announcements = channels.find((channel) => channel.slug === 'announcements')!;
    const otherGeneral = messagingRepo.ensureDefaultChannels(otherStore.id, owner.id).find((channel) => channel.slug === 'general')!;

    const message = messagingRepo.createMessage({ storeId: store.id, channelId: general.id, authorId: owner.id, body: 'Stock count at 3pm' });
    assert(messagingRepo.listMessages(store.id, general.id).length === 1, 'message should be readable in its store');
    const edited = messagingRepo.editMessage(store.id, message.id, 'Stock count at 4pm', owner.id);
    assert(edited?.body === 'Stock count at 4pm', 'author should be able to edit an unseen message');
    let moderatorEditRejected = false;
    try {
      messagingRepo.editMessage(store.id, message.id, 'Unauthorised manager correction', teammate.id);
    } catch {
      moderatorEditRejected = true;
    }
    assert(moderatorEditRejected, 'another user must never edit the author\'s message');
    assert(messagingRepo.unreadSummary(store.id, teammate.id).total === 1, 'teammate should have one unread message');
    messagingRepo.markRead(store.id, general.id, teammate.id);
    assert(messagingRepo.unreadSummary(store.id, teammate.id).total === 0, 'read watermark should clear unread count');
    assert(messagingRepo.hasBeenSeenByOther(store.id, message.id, owner.id), 'read watermark should mark the message as seen');
    let seenEditRejected = false;
    try {
      messagingRepo.editMessage(store.id, message.id, 'Attempted post-read edit', owner.id);
    } catch {
      seenEditRejected = true;
    }
    assert(seenEditRejected, 'seen messages must be locked from editing');
    assert(getDB().prepare('SELECT COUNT(*) AS count FROM message_revisions WHERE messageId=?').get(message.id).count === 2, 'edits should preserve immutable revision history');

    const globalAnnouncement = globalAnnouncementsRepo.create({ title: 'Company-wide update', body: 'All stores should review the new policy.', priority: 'high', requiresAck: true, createdById: owner.id });
    assert(globalAnnouncementsRepo.activeForUser(teammate.id).some((item) => item.id === globalAnnouncement.id), 'global announcements should appear for store members');
    assert(globalAnnouncementsRepo.activeForUser(owner.id).some((item) => item.id === globalAnnouncement.id), 'global announcements should cross store memberships');
    globalAnnouncementsRepo.acknowledge(globalAnnouncement.id, teammate.id, store.id);
    assert(globalAnnouncementsRepo.acknowledgmentCount(globalAnnouncement.id) === 1, 'global acknowledgment should be tracked');
    const notifications = notificationsRepo.messagesSince(store.id, teammate.id, new Date(0).toISOString(), new Date(Date.now() + 1000).toISOString());
    assert(notifications.some((item) => item.kind === 'message' && item.href.includes(general.id)), 'new general messages should generate notifications');
    assert(notificationsRepo.globalSince(new Date(0).toISOString(), new Date(Date.now() + 1000).toISOString()).some((item) => item.kind === 'global_announcement'), 'global announcements should generate notifications');

    const reaction = messagingRepo.toggleReaction(store.id, message.id, teammate.id, '✅');
    assert(reaction?.reactions['✅']?.includes(teammate.id), 'reaction should be persisted');
    const announcement = messagingRepo.createMessage({ storeId: store.id, channelId: announcements.id, authorId: owner.id, body: 'Price update effective tomorrow', requiresAck: true });
    messagingRepo.acknowledge(store.id, announcement.id, teammate.id);
    assert(messagingRepo.hasAcknowledged(announcement.id, teammate.id), 'acknowledgment should be persisted');
    assert(messagingRepo.acknowledgmentCount(store.id, announcement.id) === 1, 'acknowledgment count should be scoped');
    const auditAfterAck = messagingRepo.auditForStore(store.id).length;
    messagingRepo.acknowledge(store.id, announcement.id, teammate.id);
    assert(messagingRepo.auditForStore(store.id).length === auditAfterAck, 'repeated acknowledgment must not duplicate audit records');

    const direct = messagingRepo.createDirectConversation(store.id, owner.id, teammate.id);
    assert(messagingRepo.listDirectConversations(store.id, owner.id).length === 1, 'manager should see the direct conversation');
    assert(messagingRepo.listDirectConversations(store.id, teammate.id).length === 1, 'employee should see the direct conversation');
    const directMessage = messagingRepo.createMessage({ storeId: store.id, channelId: direct.id, authorId: owner.id, body: 'Can we review tomorrow\'s stock plan?' });
    assert(messagingRepo.listMessages(store.id, direct.id, undefined, owner.id).some((item) => item.id === directMessage.id), 'direct message should be readable by participants');
    assert(messagingRepo.listMessages(store.id, direct.id, undefined, 'not-a-participant').length === 0, 'direct messages must not leak to non-participants');
    assert(messagingRepo.isParticipant(store.id, direct.id, teammate.id), 'employee should be a participant');
    const directReply = messagingRepo.createMessage({ storeId: store.id, channelId: direct.id, authorId: teammate.id, body: 'Yes, let\'s review it.', parentId: directMessage.id });
    assert(directReply.parentId === directMessage.id, 'direct participants should be able to reply in a thread');

    let rejected = false;
    try {
      messagingRepo.createMessage({ storeId: store.id, channelId: otherGeneral.id, authorId: owner.id, body: 'cross-store write' });
    } catch {
      rejected = true;
    }
    assert(rejected, 'cross-store channel writes must be rejected');
    assert(messagingRepo.auditForStore(store.id).length >= 4, 'message lifecycle should be auditable');
    assert(outboxRepo.pendingCount() > 0, 'messaging writes should enter the outbox');
    console.log('✓ messaging smoke test passed');
  } finally {
    closeDB();
    for (const suffix of ['', '-wal', '-shm']) {
      try { fs.unlinkSync(dbPath + suffix); } catch { /* already absent */ }
    }
  }
}

main().catch((error) => {
  console.error('✗ messaging smoke test failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
