'use client';
import { WifiOff, RefreshCw } from 'lucide-react';

export default function OfflinePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4 text-center">
      <div className="rounded-full bg-amber-100 p-4 text-amber-600">
        <WifiOff className="h-10 w-10" />
      </div>
      <h1 className="text-2xl font-bold tracking-tight">You're offline</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        Store Point keeps working without internet. Your changes save locally and sync automatically when you're back online.
      </p>
      <button
        onClick={() => window.location.reload()}
        className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
      >
        <RefreshCw className="h-4 w-4" />
        Try again
      </button>
    </div>
  );
}
