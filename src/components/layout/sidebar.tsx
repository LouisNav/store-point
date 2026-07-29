'use client';
import * as React from 'react';
import { useState, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Boxes,
  Calculator,
  ClipboardList,
  Home,
  LayoutDashboard,
  Menu,
  Palette,
  PanelLeftClose,
  PanelLeft,
  ScanLine,
  Settings,
  ShoppingCart,
  Users,
  Wallet,
  X,
  CreditCard,
} from 'lucide-react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { cn } from '@/lib/utils';
import type { Role } from '@/lib/types';

interface Item {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: Role[];
}

const NAV: Item[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['ROOT_ADMIN', 'MANAGER', 'INVENTORY', 'SALES_AGENT', 'VIEWER'] },
  { href: '/pos', label: 'Cash Register (POS)', icon: ScanLine, roles: ['ROOT_ADMIN', 'MANAGER', 'SALES_AGENT'] },
  { href: '/products', label: 'Products', icon: Boxes, roles: ['ROOT_ADMIN', 'MANAGER', 'INVENTORY', 'SALES_AGENT', 'VIEWER'] },
  { href: '/customers', label: 'Customers', icon: Users, roles: ['ROOT_ADMIN', 'MANAGER', 'INVENTORY', 'SALES_AGENT', 'VIEWER'] },
  { href: '/sales', label: 'Sales history', icon: ClipboardList, roles: ['ROOT_ADMIN', 'MANAGER', 'SALES_AGENT', 'VIEWER'] },
  { href: '/reports/cashup', label: 'Daily cash-up', icon: Calculator, roles: ['ROOT_ADMIN', 'MANAGER'] },
  { href: '/reports/profit', label: 'Profit report', icon: Wallet, roles: ['ROOT_ADMIN', 'MANAGER'] },
  { href: '/users', label: 'Staff & roles', icon: ShoppingCart, roles: ['ROOT_ADMIN', 'MANAGER'] },
  { href: '/settings/brand', label: 'Store branding', icon: Palette, roles: ['ROOT_ADMIN', 'MANAGER'] },
  { href: '/stores', label: 'Switch store', icon: Home, roles: ['ROOT_ADMIN', 'MANAGER', 'INVENTORY', 'SALES_AGENT', 'VIEWER'] },
  { href: '/settings/profile', label: 'My profile', icon: Settings, roles: ['ROOT_ADMIN', 'MANAGER', 'INVENTORY', 'SALES_AGENT', 'VIEWER'] },
];

function NavItems({
  items,
  pathname,
  collapsed,
  onNavigate,
}: {
  items: Item[];
  pathname: string;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  return (
    <ul className="space-y-1 h-full overflow-y-auto scroll-thin pr-1">
      {items.map((it) => {
        const active = pathname === it.href || pathname.startsWith(it.href + '/');
        const Icon = it.icon;
        return (
          <li key={it.href}>
            <Link
              href={it.href}
              onClick={onNavigate}
              aria-label={collapsed ? it.label : undefined}
              className={cn(
                'group relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                collapsed && 'justify-center px-2',
                active
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              <Icon className={cn('h-4 w-4 shrink-0', active && 'text-primary')} />
              {!collapsed && <span className="truncate">{it.label}</span>}
              {/* Instant tooltip when collapsed — appears to the right of the icon */}
              {collapsed && (
                <span className="pointer-events-none absolute left-full top-1/2 ml-3 -translate-y-1/2 rounded-md bg-foreground px-2.5 py-1.5 text-xs font-medium text-background opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 whitespace-nowrap z-50">
                  {it.label}
                </span>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function LogoBlock({
  storeName,
  storeLogo,
  collapsed,
}: {
  storeName: string;
  storeLogo?: string;
  collapsed: boolean;
}) {
  return (
    <div className={cn('flex items-center gap-3', collapsed && 'justify-center')}>
      {storeLogo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={storeLogo} alt="logo" className="h-8 w-8 shrink-0 rounded-md object-cover" />
      ) : (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
          <CreditCard className="h-4 w-4" />
        </div>
      )}
      {!collapsed && (
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{storeName}</div>
        </div>
      )}
    </div>
  );
}

const COLLAPSED_KEY = 'storepoint:sidebar:collapsed';

function loadCollapsed(): boolean {
  try {
    return window.localStorage.getItem(COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

function saveCollapsed(v: boolean) {
  try {
    window.localStorage.setItem(COLLAPSED_KEY, v ? '1' : '0');
  } catch {
    /* ignore */
  }
}

export function Sidebar({
  role,
  storeName,
  storeLogo,
  isMultiStore,
}: {
  role: Role;
  storeName: string;
  storeLogo?: string;
  isMultiStore: boolean;
}) {
  const pathname = usePathname() ?? '';
  const [collapsed, setCollapsedRaw] = useState(() => loadCollapsed());
  const setCollapsed = useCallback((v: boolean) => {
    setCollapsedRaw(v);
    saveCollapsed(v);
  }, []);
  const [mobileOpen, setMobileOpen] = useState(false);
  const items = NAV.filter((n) =>
    n.roles.includes(role) && (n.href !== '/stores' || isMultiStore),
  );

  return (
    <>
      {/* Desktop sidebar — sticky to viewport, scrolls internally */}
      <aside
        className={cn(
          'sticky top-0 hidden h-screen shrink-0 flex-col border-r bg-card transition-[width] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] md:flex',
          collapsed ? 'w-[4.5rem]' : 'w-64',
        )}
      >
        {/* Header with logo + collapse toggle */}
        <div className={cn('flex shrink-0 items-center justify-between border-b px-5 py-3', collapsed && 'justify-center px-3')}>
          <LogoBlock storeName={storeName} storeLogo={storeLogo} collapsed={collapsed} />
          {!collapsed && (
            <button
              type="button"
              onClick={() => setCollapsed(true)}
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              title="Collapse sidebar"
              aria-label="Collapse sidebar"
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Scrollable nav area — scroll is on the ul inside NavItems so tooltips can overflow */}
        <nav className="flex-1 overflow-visible p-3">
          <NavItems items={items} pathname={pathname} collapsed={collapsed} />
        </nav>

        {/* Expand button — always at bottom */}
        {collapsed && (
          <div className="shrink-0 border-t p-2">
            <button
              type="button"
              onClick={() => setCollapsed(false)}
              className="flex w-full items-center justify-center rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              title="Expand sidebar"
              aria-label="Expand sidebar"
            >
              <PanelLeft className="h-4 w-4" />
            </button>
          </div>
        )}
      </aside>

      {/* Mobile hamburger — fixed at top-left, above the topbar */}
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="fixed left-3 top-3 z-50 flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-md transition-transform hover:scale-105 active:scale-95 md:hidden"
        aria-label="Open navigation menu"
      >
        <Menu className="h-4 w-4" />
      </button>

      {/* Mobile drawer */}
      <DialogPrimitive.Root open={mobileOpen} onOpenChange={setMobileOpen} modal={false}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <DialogPrimitive.Content
            aria-describedby="mobile-nav-desc"
            className={cn(
              'fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col bg-card shadow-2xl',
              'data-[state=open]:animate-in data-[state=closed]:animate-out',
              'data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left',
              'duration-300',
            )}
          >
            <DialogPrimitive.Title className="sr-only">Navigation menu</DialogPrimitive.Title>
            <DialogPrimitive.Description id="mobile-nav-desc" className="sr-only">
              Store navigation links for {storeName}
            </DialogPrimitive.Description>

            {/* Header */}
            <div className="flex items-center justify-between border-b px-5 py-4">
              <LogoBlock storeName={storeName} storeLogo={storeLogo} collapsed={false} />
              <DialogPrimitive.Close className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                <X className="h-5 w-5" />
                <span className="sr-only">Close</span>
              </DialogPrimitive.Close>
            </div>

            {/* Nav */}
            <nav className="flex-1 overflow-y-auto p-3 scroll-thin">
              <NavItems items={items} pathname={pathname} collapsed={false} onNavigate={() => setMobileOpen(false)} />
            </nav>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  );
}
