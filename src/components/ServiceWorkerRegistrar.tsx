'use client';
import { useEffect } from 'react';

export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;
    // Defer registration so it doesn't block first paint / hydration.
    const id = window.setTimeout(() => {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .then((reg) => {
          // Check for updates every 60 min while the tab is open.
          setInterval(() => reg.update().catch(() => undefined), 60 * 60 * 1000);
        })
        .catch(() => {
          /* SW registration is best-effort; ignore failures. */
        });
    }, 1500);
    return () => window.clearTimeout(id);
  }, []);

  return null;
}
