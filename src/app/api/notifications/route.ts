import { NextResponse } from 'next/server';
import { getOptionalUser, isRootUser } from '@/lib/auth/guards';
import { membershipsRepo } from '@/lib/db/repositories/memberships.repo';
import { notificationsRepo } from '@/lib/db/repositories/notifications.repo';
import { productsRepo } from '@/lib/db/repositories/products.repo';
import { can, Permission } from '@/lib/rbac';
import type { AppNotification } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function validISO(value: string | null, fallback: string): string {
  if (!value) return fallback;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed.toISOString();
}

export async function GET(request: Request) {
  const session = await getOptionalUser();
  if (!session || !session.userId || !session.activeStoreId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  }
  const membership = membershipsRepo.activeRole(session.userId, session.activeStoreId);
  const root = await isRootUser(session);
  if (!membership && !root) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  }
  const effectiveRole = membership?.role ?? 'ROOT_ADMIN';

  const url = new URL(request.url);
  const now = new Date().toISOString();
  const since = validISO(url.searchParams.get('since'), new Date(Date.now() - 15_000).toISOString());
  const until = validISO(url.searchParams.get('until'), now);
  const notifications: AppNotification[] = [
    ...notificationsRepo.messagesSince(session.activeStoreId, session.userId, since, until),
    ...notificationsRepo.globalSince(since, until),
  ];

  if (can(effectiveRole, Permission.StockAdjust)) {
    for (const product of productsRepo.lowStock(session.activeStoreId, 12)) {
      notifications.push({
        id: `low-stock:${product.id}:${product.stockQty}:${product.lowStockThreshold}`,
        kind: 'low_stock',
        priority: product.stockQty <= 0 ? 'high' : 'normal',
        title: product.stockQty <= 0 ? 'Product out of stock' : 'Low stock alert',
        body: `${product.name} has ${product.stockQty} unit${product.stockQty === 1 ? '' : 's'} remaining.`,
        href: '/products',
        createdAt: product.updatedAt,
      });
    }
  }

  notifications.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return NextResponse.json({ notifications: notifications.slice(-60) }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
