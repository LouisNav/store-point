import { redirect } from 'next/navigation';
import { Sidebar } from '@/components/layout/sidebar';
import { Topbar } from '@/components/layout/topbar';
import { OfflineBanner } from '@/components/OfflineBanner';
import { isRootUser, requireUser } from '@/lib/auth/guards';
import { storesRepo, parseBrand } from '@/lib/db/repositories/stores.repo';
import { brandToThemeCss } from '@/lib/brand';
import { outboxRepo } from '@/lib/db/repositories/outbox.repo';
import { getMongo } from '@/lib/db/mongo';
import { env } from '@/env';
import type { Role } from '@/lib/types';
import { messagingRepo } from '@/lib/db/repositories/messaging.repo';
import { NotificationCenter } from '@/components/NotificationCenter';
import { GlobalAnnouncementBanner } from '@/components/GlobalAnnouncementBanner';
import { globalAnnouncementsRepo } from '@/lib/db/repositories/global-announcements.repo';
import { membershipsRepo } from '@/lib/db/repositories/memberships.repo';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireUser();
  // Resolve root status and active membership from the authoritative database;
  // session membership snapshots are only presentation data.
  const root = await isRootUser(session);
  const activeRole: Role | undefined = root
    ? 'ROOT_ADMIN'
    : session.activeStoreId
      ? membershipsRepo.activeRole(session.userId!, session.activeStoreId)?.role
      : undefined;
  // If role is missing, defer to /stores to pick one.
  if (!session.activeStoreId || !activeRole) redirect('/stores');

  const store = storesRepo.byId(session.activeStoreId);
  if (!store) redirect('/stores');

  // Refresh membership store names from DB — session caches them at login
  // and they go stale when the store name is changed via Brand settings.
  const freshMemberships = root
    ? storesRepo.list().map((s) => ({ storeId: s.id, storeName: s.name, role: 'ROOT_ADMIN' as const }))
    : membershipsRepo.forUser(session.userId!).map((m) => {
      const s = storesRepo.byId(m.storeId);
      return { storeId: m.storeId, storeName: s?.name ?? m.storeId, role: m.role };
    });

  const brand = parseBrand(store.brandJson);
  const themeCss = brandToThemeCss(store.brandJson);
  // Provision the operational channels lazily for existing stores and surface
  // a compact unread count in the persistent navigation.
  messagingRepo.ensureDefaultChannels(session.activeStoreId, session.userId!);
  const unreadMessages = messagingRepo.unreadSummary(session.activeStoreId, session.userId!).total;
  const globalAnnouncements = globalAnnouncementsRepo.activeForUser(session.userId!, 10);

  // Multi-store: an authoritative root admin always has it; staff only if
  // assigned to multiple active stores.
  const isMultiStore = root || freshMemberships.length > 1;

  // Resolve sync status at SSR — Topbar will poll afterwards.
  const pending = outboxRepo.pendingCount();
  let online = false;
  if (env().MONGODB_URI) {
    const conn = await getMongo();
    online = !!conn;
  }

  return (
    <div style={{ minHeight: '100vh' }}>
      <style dangerouslySetInnerHTML={{ __html: themeCss }} />
      <OfflineBanner />
      <NotificationCenter />
      <GlobalAnnouncementBanner announcements={globalAnnouncements} />
      <div className="flex min-h-screen">
        <Sidebar role={activeRole} storeName={store.name} storeLogo={brand.logoDataUrl} isMultiStore={isMultiStore} unreadMessages={unreadMessages} />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar
            user={{ name: session.name ?? '', email: session.email ?? '' }}
            memberships={freshMemberships}
            activeStoreId={session.activeStoreId}
            activeRole={activeRole}
            isMultiStore={isMultiStore}
            syncStatus={{ state: online ? 'online' : 'offline', pending }}
          />
          <main className="flex-1 bg-muted/20 p-3 pb-20 md:p-8 md:pb-8">
            <div className="mx-auto w-full max-w-7xl">{children}</div>
          </main>
        </div>
      </div>
    </div>
  );
}
