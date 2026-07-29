'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, LogOut, Cloud, CloudOff, CheckCircle2 } from 'lucide-react';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import type { Role } from '@/lib/types';
import { ROLE_LABEL } from '@/lib/rbac';

interface Membership {
  storeId: string;
  storeName: string;
  role: Role;
}

export function Topbar({
  user,
  memberships,
  activeStoreId,
  activeRole,
  isMultiStore,
  syncStatus,
}: {
  user: { name: string; email: string };
  memberships: Membership[];
  activeStoreId: string;
  activeRole: Role;
  isMultiStore: boolean;
  syncStatus: { state: 'online' | 'offline'; pending: number };
}) {
  const router = useRouter();
  const [poster, setPoster] = useState(syncStatus);

  useEffect(() => {
    let mounted = true;
    async function poll() {
      try {
        const r = await fetch('/api/sync-status', { cache: 'no-store' });
        if (!r.ok) return;
        const data = await r.json();
        if (mounted) setPoster({ state: data.state, pending: data.pending });
      } catch {
        /* ignore */
      }
    }
    poll();
    const id = setInterval(poll, 7000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, []);

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  async function switchStore(storeId: string) {
    await fetch('/api/stores/switch', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ storeId }),
    });
    router.refresh();
  }

  const activeStore = memberships.find((m) => m.storeId === activeStoreId);

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/85 px-3 backdrop-blur md:gap-3 md:px-6">
      {/* Mobile: show store name */}
      <div className="md:hidden min-w-0 flex-1 pl-10">
        <span className="truncate text-sm font-semibold">
          {activeStore?.storeName ?? 'Store'}
        </span>
      </div>

      <div className="ml-auto flex items-center gap-1.5 md:gap-2">
        <ThemeToggle />

        {/* Sync status */}
        <Badge
          variant={poster.state === 'online' ? 'success' : 'warning'}
          className="hidden text-xs sm:inline-flex"
        >
          {poster.state === 'online' ? (
            <>
              <Cloud className="mr-1 h-3 w-3" /> Synced
            </>
          ) : (
            <>
              <CloudOff className="mr-1 h-3 w-3" /> Offline · {poster.pending}
            </>
          )}
        </Badge>
        {/* Mobile sync dot */}
        <span
          role="status"
          aria-label={poster.state === 'online' ? 'Cloud synced' : `Offline · ${poster.pending} changes queued`}
          className={`inline-flex h-2.5 w-2.5 rounded-full sm:hidden ${poster.state === 'online' ? 'bg-success' : 'bg-amber-500 animate-pulse'}`}
        />

        {/* Store display: dropdown for multi-store, plain text for single-store */}
        {isMultiStore ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 gap-1 px-2 md:gap-2 md:px-3">
                <span className="hidden text-[10px] text-muted-foreground sm:inline">Store:</span>
                <span className="max-w-[6rem] truncate text-xs font-medium md:max-w-[10rem] md:text-sm">
                  {activeStore?.storeName ?? '—'}
                </span>
                <ChevronDown className="h-3.5 w-3.5 opacity-70" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[14rem] md:min-w-[16rem]">
              <DropdownMenuLabel>Switch store</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {memberships.length === 0 && (
                <div className="px-2 py-3 text-sm text-muted-foreground">No stores yet.</div>
              )}
              {memberships.map((m) => (
                <DropdownMenuItem key={m.storeId} onClick={() => switchStore(m.storeId)}>
                  <div className="flex w-full items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{m.storeName}</div>
                      <div className="text-xs text-muted-foreground">{ROLE_LABEL[m.role]}</div>
                    </div>
                    {m.storeId === activeStoreId && <CheckCircle2 className="h-4 w-4 text-primary" />}
                  </div>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Badge variant="secondary" className="h-8 px-3 text-xs font-medium">
            {activeStore?.storeName ?? '—'}
          </Badge>
        )}

        {/* User menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 gap-1.5 px-2 md:gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-primary md:h-7 md:w-7">
                <span className="text-[10px] font-semibold md:text-xs">
                  {user.name.slice(0, 1).toUpperCase()}
                </span>
              </div>
              <div className="hidden text-left sm:block">
                <div className="text-xs font-semibold leading-none">{user.name}</div>
                <div className="text-[10px] leading-none text-muted-foreground">{ROLE_LABEL[activeRole]}</div>
              </div>
              <ChevronDown className="hidden h-3.5 w-3.5 opacity-70 sm:block" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>{user.email}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={logout}>
              <LogOut className="mr-2 h-4 w-4" /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
