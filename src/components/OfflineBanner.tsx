'use client';
import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';

export function OfflineBanner() {
  const online = useOnlineStatus();
  if (online) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center justify-center gap-2 border-b border-amber-300/60 bg-amber-100 px-4 py-1.5 text-xs font-medium text-amber-900"
    >
      <WifiOff className="h-3.5 w-3.5" />
      Offline · your changes are saving locally and will sync when the network is back.
    </div>
  );
}
