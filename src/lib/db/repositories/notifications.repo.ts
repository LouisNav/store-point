import { getDB } from '../sqlite';
import { globalAnnouncementsRepo } from './global-announcements.repo';
import type { AppNotification } from '../../types';

export const notificationsRepo = {
  messagesSince(storeId: string, userId: string, since: string, until: string, limit = 50): AppNotification[] {
    const rows = getDB().prepare<[string, string, string, string, string, number], {
      id: string;
      kind: 'general' | 'announcement' | 'direct';
      channelId: string;
      channelName: string;
      body: string;
      createdAt: string;
      authorName: string;
    }>(
      `SELECT m.id, c.kind, c.id AS channelId, c.name AS channelName, m.body, m.createdAt,
              COALESCE(u.name, 'A team member') AS authorName
       FROM messages m
       JOIN channels c ON c.id=m.channelId AND c.storeId=m.storeId AND c.deletedAt IS NULL
       LEFT JOIN users u ON u.id=m.authorId AND u.deletedAt IS NULL
       WHERE m.storeId=? AND m.deletedAt IS NULL AND m.authorId<>?
         AND m.createdAt>? AND m.createdAt<=?
         AND (c.kind<>'direct' OR EXISTS (
           SELECT 1 FROM channel_participants p
           WHERE p.channelId=c.id AND p.storeId=c.storeId AND p.userId=?
         ))
       ORDER BY m.createdAt ASC LIMIT ?`,
    ).all(storeId, userId, since, until, userId, limit);

    return rows.map((row) => {
      const isAnnouncement = row.kind === 'announcement';
      const isDirect = row.kind === 'direct';
      return {
        id: `message:${row.id}`,
        kind: isAnnouncement ? 'announcement' : 'message',
        priority: isAnnouncement ? 'high' : 'normal',
        title: isAnnouncement ? 'New announcement' : isDirect ? `Message from ${row.authorName}` : `New message in ${row.channelName}`,
        body: row.body.length > 160 ? `${row.body.slice(0, 157)}…` : row.body,
        href: isDirect ? `/messages?dm=${encodeURIComponent(row.channelId)}` : `/messages?channel=${encodeURIComponent(row.channelId)}`,
        createdAt: row.createdAt,
      } satisfies AppNotification;
    });
  },

  globalSince(since: string, until: string): AppNotification[] {
    return globalAnnouncementsRepo.since(since, until).map((announcement) => ({
      id: `global-announcement:${announcement.id}`,
      kind: 'global_announcement',
      priority: announcement.priority === 'critical' ? 'high' : announcement.priority === 'high' ? 'high' : 'normal',
      title: announcement.title,
      body: announcement.body.length > 160 ? `${announcement.body.slice(0, 157)}…` : announcement.body,
      href: '/dashboard',
      createdAt: announcement.publishedAt,
    } satisfies AppNotification));
  },
};
