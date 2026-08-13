import { getOptionalUser, isRootUser } from '@/lib/auth/guards';
import { membershipsRepo } from '@/lib/db/repositories/memberships.repo';
import { notificationsRepo } from '@/lib/db/repositories/notifications.repo';
import { productsRepo } from '@/lib/db/repositories/products.repo';
import { can, Permission } from '@/lib/rbac';
import type { AppNotification } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
  const session = await getOptionalUser();
  if (!session || !session.userId || !session.activeStoreId) {
    return new Response('Unauthorized', { status: 401 });
  }
  const membership = membershipsRepo.activeRole(session.userId, session.activeStoreId);
  const root = await isRootUser(session);
  if (!membership && !root) {
    return new Response('Unauthorized', { status: 401 });
  }
  const role = membership?.role ?? 'ROOT_ADMIN';
  const storeId = session.activeStoreId;
  const userId = session.userId;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const send = (data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          /* connection already closed */
        }
      };

      // Start just behind "now" so a client that connects immediately after an
      // event still receives it, then advance the cursor on each sweep.
      let last = Date.now() - 15_000;

      const sweep = () => {
        try {
          const until = new Date().toISOString();
          const since = new Date(last).toISOString();
          const notifications: AppNotification[] = [
            ...notificationsRepo.messagesSince(storeId, userId, since, until),
            ...notificationsRepo.globalSince(since, until),
          ];
          if (can(role, Permission.StockAdjust)) {
            for (const product of productsRepo.lowStock(storeId, 12)) {
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
          last = Date.now();
          if (notifications.length > 0) send({ type: 'notifications', notifications });
        } catch {
          /* transient DB error — next sweep retries */
        }
      };

      sweep();
      const heartbeat = setInterval(() => send({ type: 'ping' }), 15_000);
      const sweepInterval = setInterval(sweep, 2_000);

      const cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        clearInterval(sweepInterval);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      request.signal.addEventListener('abort', cleanup);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
