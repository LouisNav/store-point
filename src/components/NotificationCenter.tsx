'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import type { AppNotification } from '@/lib/types';

const POLL_MS = 15_000;
const SEEN_KEY = 'storepoint:notifications:seen';

function loadSeen(): Set<string> {
  try {
    const raw = window.sessionStorage.getItem(SEEN_KEY);
    const parsed = raw ? JSON.parse(raw) as unknown : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string').slice(-200) : []);
  } catch {
    return new Set();
  }
}

function saveSeen(seen: Set<string>) {
  try {
    window.sessionStorage.setItem(SEEN_KEY, JSON.stringify([...seen].slice(-200)));
  } catch {
    /* Notifications remain functional for this tab even when storage is unavailable. */
  }
}

export function NotificationCenter() {
  const router = useRouter();
  const cursor = useRef(new Date().toISOString());
  const seen = useRef<Set<string> | null>(null);
  const polling = useRef(false);

  useEffect(() => {
    seen.current = loadSeen();
    let cancelled = false;

    function handle(notification: AppNotification) {
      const localSeen = seen.current ?? new Set<string>();
      if (!notification?.id || localSeen.has(notification.id)) return;
      localSeen.add(notification.id);
      const open = () => router.push(notification.href);
      const options = {
        id: notification.id,
        description: notification.body,
        duration: notification.priority === 'high' ? 10_000 : 6_000,
        action: { label: 'Open', onClick: open },
      };
      if (notification.kind === 'announcement' || notification.kind === 'global_announcement') toast.warning(notification.title, options);
      else if (notification.kind === 'low_stock') toast.info(notification.title, options);
      else toast(notification.title, options);
      seen.current = localSeen;
      saveSeen(localSeen);
    }

    // Polling backstop — also covers offline-first operation and any SSE gap.
    async function poll() {
      if (cancelled || polling.current || document.visibilityState !== 'visible') return;
      polling.current = true;
      const upperBound = new Date().toISOString();
      try {
        const response = await fetch(`/api/notifications?since=${encodeURIComponent(cursor.current)}&until=${encodeURIComponent(upperBound)}`, {
          cache: 'no-store',
          credentials: 'same-origin',
        });
        if (response.ok) {
          const data = await response.json() as { notifications?: AppNotification[] };
          cursor.current = upperBound;
          for (const notification of data.notifications ?? []) handle(notification);
        }
      } catch {
        // Offline-first: the next visible poll retries silently.
      } finally {
        polling.current = false;
      }
    }

    // Server-Sent Events for near-real-time delivery. EventSource reconnects
    // automatically; the poll above remains as a backstop.
    const es = new EventSource('/api/notifications/stream');
    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as { type?: string; notifications?: AppNotification[] };
        if (data?.type === 'notifications') {
          for (const notification of data.notifications ?? []) handle(notification);
          // Keep the poll cursor ahead of anything SSE already delivered so the
          // backstop doesn't re-fetch a large window.
          cursor.current = new Date().toISOString();
        }
      } catch {
        /* ignore malformed frames */
      }
    };

    void poll();
    const interval = window.setInterval(() => void poll(), POLL_MS);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void poll();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      cancelled = true;
      es.close();
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [router]);

  return null;
}
