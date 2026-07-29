import { redirect } from 'next/navigation';
import { Sidebar } from '@/components/layout/sidebar';
import { Topbar } from '@/components/layout/topbar';
import { OfflineBanner } from '@/components/OfflineBanner';
import { requireUser } from '@/lib/auth/guards';
import { storesRepo, parseBrand } from '@/lib/db/repositories/stores.repo';
import { brandToThemeCss } from '@/lib/brand';
import { outboxRepo } from '@/lib/db/repositories/outbox.repo';
import { getMongo } from '@/lib/db/mongo';
import { env } from '@/env';
import type { Role } from '@/lib/types';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireUser();
  // Surface active store + role (typed Role) so child components can reason
  // about role-aware UI without re-parsing strings.
  const activeRole: Role | undefined = session.memberships?.find(
    (m) => m.storeId === session.activeStoreId,
  )?.role;
  // If role is missing, defer to /stores to pick one.
  if (!session.activeStoreId || !activeRole) redirect('/stores');

  const store = storesRepo.byId(session.activeStoreId);
  if (!store) redirect('/stores');

  // Refresh membership store names from DB — session caches them at login
  // and they go stale when the store name is changed via Brand settings.
  const freshMemberships = (session.memberships ?? []).map((m) => {
    const s = storesRepo.byId(m.storeId);
    return { ...m, storeName: s?.name ?? m.storeName };
  });

  const brand = parseBrand(store.brandJson);
  const themeCss = brandToThemeCss(store.brandJson);

  // Multi-store: root admin always has it; staff only if assigned to multiple stores
  const isMultiStore = session.isRoot === true || (session.memberships?.length ?? 0) > 1;

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
      <div className="flex min-h-screen">
        <Sidebar role={activeRole} storeName={store.name} storeLogo={brand.logoDataUrl} isMultiStore={isMultiStore} />
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
