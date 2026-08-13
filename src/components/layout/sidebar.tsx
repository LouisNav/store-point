'use client';
import * as React from 'react';
import { useState, useCallback, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Boxes,
  Calculator,
  ChevronDown,
  ClipboardList,
  Home,
  LayoutDashboard,
  Menu,
  Palette,
  PanelLeftClose,
  PanelLeft,
  ScanLine,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Users,
  Wallet,
  X,
  CreditCard,
  MessageSquare,
  Megaphone,
} from 'lucide-react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { cn } from '@/lib/utils';
import type { Role } from '@/lib/types';

type NavCategory = 'Overview' | 'Communication' | 'Operations' | 'Reports' | 'Administration' | 'Account';

interface Item {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: Role[];
  category: NavCategory;
  badge?: number;
}

const CATEGORY_ORDER: NavCategory[] = [
  'Overview',
  'Communication',
  'Operations',
  'Reports',
  'Administration',
  'Account',
];

const CATEGORY_META: Record<NavCategory, {
  icon: React.ComponentType<{ className?: string }>;
  iconClass: string;
}> = {
  Overview: { icon: LayoutDashboard, iconClass: 'bg-sky-500/10 text-sky-600 dark:text-sky-400' },
  Communication: { icon: MessageSquare, iconClass: 'bg-violet-500/10 text-violet-600 dark:text-violet-400' },
  Operations: { icon: Boxes, iconClass: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
  Reports: { icon: Wallet, iconClass: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
  Administration: { icon: Settings, iconClass: 'bg-rose-500/10 text-rose-600 dark:text-rose-400' },
  Account: { icon: CreditCard, iconClass: 'bg-slate-500/10 text-slate-600 dark:text-slate-400' },
};

const NAV: Item[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, category: 'Overview', roles: ['ROOT_ADMIN', 'MANAGER', 'INVENTORY', 'SALES_AGENT', 'VIEWER'] },
  { href: '/messages', label: 'Messages', icon: MessageSquare, category: 'Communication', roles: ['ROOT_ADMIN', 'MANAGER', 'INVENTORY', 'SALES_AGENT', 'VIEWER'] },
  { href: '/settings/announcements', label: 'Global announcements', icon: Megaphone, category: 'Communication', roles: ['ROOT_ADMIN'] },
  { href: '/pos', label: 'Cash Register (POS)', icon: ScanLine, category: 'Operations', roles: ['ROOT_ADMIN', 'MANAGER', 'SALES_AGENT'] },
  { href: '/products', label: 'Products', icon: Boxes, category: 'Operations', roles: ['ROOT_ADMIN', 'MANAGER', 'INVENTORY', 'SALES_AGENT', 'VIEWER'] },
  { href: '/customers', label: 'Customers', icon: Users, category: 'Operations', roles: ['ROOT_ADMIN', 'MANAGER', 'INVENTORY', 'SALES_AGENT', 'VIEWER'] },
  { href: '/sales', label: 'Sales history', icon: ClipboardList, category: 'Operations', roles: ['ROOT_ADMIN', 'MANAGER', 'SALES_AGENT', 'VIEWER'] },
  { href: '/reports/cashup', label: 'Daily cash-up', icon: Calculator, category: 'Reports', roles: ['ROOT_ADMIN', 'MANAGER'] },
  { href: '/reports/profit', label: 'Profit report', icon: Wallet, category: 'Reports', roles: ['ROOT_ADMIN', 'MANAGER'] },
  { href: '/users', label: 'Staff & roles', icon: ShoppingCart, category: 'Administration', roles: ['ROOT_ADMIN', 'MANAGER'] },
  { href: '/settings/brand', label: 'Store branding', icon: Palette, category: 'Administration', roles: ['ROOT_ADMIN', 'MANAGER'] },
  { href: '/settings/audit', label: 'Audit log', icon: ShieldCheck, category: 'Administration', roles: ['ROOT_ADMIN', 'MANAGER'] },
  { href: '/stores', label: 'Switch store', icon: Home, category: 'Administration', roles: ['ROOT_ADMIN', 'MANAGER', 'INVENTORY', 'SALES_AGENT', 'VIEWER'] },
  { href: '/settings/profile', label: 'My profile', icon: Settings, category: 'Account', roles: ['ROOT_ADMIN', 'MANAGER', 'INVENTORY', 'SALES_AGENT', 'VIEWER'] },
];

const OPEN_GROUPS_KEY = 'storepoint:sidebar:open-groups';
const DEFAULT_OPEN_GROUPS = Object.fromEntries(
  CATEGORY_ORDER.map((category) => [category, true]),
) as Record<NavCategory, boolean>;

function loadOpenGroups(): Record<NavCategory, boolean> {
  try {
    const raw = window.localStorage.getItem(OPEN_GROUPS_KEY);
    if (!raw) return DEFAULT_OPEN_GROUPS;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return CATEGORY_ORDER.reduce((state, category) => {
      state[category] = parsed[category] !== false;
      return state;
    }, { ...DEFAULT_OPEN_GROUPS });
  } catch {
    return DEFAULT_OPEN_GROUPS;
  }
}

function saveOpenGroups(groups: Record<NavCategory, boolean>) {
  try {
    window.localStorage.setItem(OPEN_GROUPS_KEY, JSON.stringify(groups));
  } catch {
    /* localStorage may be blocked; navigation remains fully usable. */
  }
}

function NavItems({
  items,
  pathname,
  collapsed,
  openGroups,
  onToggleGroup,
  onNavigate,
  idPrefix,
}: {
  items: Item[];
  pathname: string;
  collapsed: boolean;
  openGroups: Record<NavCategory, boolean>;
  onToggleGroup: (category: NavCategory) => void;
  onNavigate?: () => void;
  idPrefix: string;
}) {
  const groups = CATEGORY_ORDER
    .map((category) => ({ category, items: items.filter((item) => item.category === category) }))
    .filter((group) => group.items.length > 0);

  return (
    <div className="min-h-0">
      {groups.map((group, groupIndex) => {
        const meta = CATEGORY_META[group.category];
        const GroupIcon = meta.icon;
        const isOpen = openGroups[group.category];
        return (
          <section
            key={group.category}
            aria-labelledby={!collapsed ? `${idPrefix}-nav-group-${group.category.toLowerCase()}` : undefined}
            aria-label={collapsed ? group.category : undefined}
            className={cn(groupIndex > 0 && 'mt-4 border-t border-border/70 pt-3')}
          >
            {!collapsed && (
              <button
                type="button"
                id={`${idPrefix}-nav-group-${group.category.toLowerCase()}`}
                aria-expanded={isOpen}
                onClick={() => onToggleGroup(group.category)}
                className="group/section mb-1 flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <span className={cn('flex h-5 w-5 items-center justify-center rounded-md', meta.iconClass)}>
                  <GroupIcon className="h-3 w-3" />
                </span>
                <span className="flex-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80">
                  {group.category}
                </span>
                <ChevronDown className={cn('h-3.5 w-3.5 text-muted-foreground transition-transform duration-200', !isOpen && '-rotate-90')} />
              </button>
            )}
            {isOpen && (
              <ul className="space-y-1">
                {group.items.map((it) => {
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
                        {!collapsed && <span className="min-w-0 flex-1 truncate">{it.label}</span>}
                        {!collapsed && it.badge ? <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">{it.badge > 99 ? '99+' : it.badge}</span> : null}
                        {collapsed && (
                          <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 -translate-y-1/2 whitespace-nowrap rounded-md bg-foreground px-2.5 py-1.5 text-xs font-medium text-background opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100">
                            {it.label}
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </div>
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
  unreadMessages = 0,
}: {
  role: Role;
  storeName: string;
  storeLogo?: string;
  isMultiStore: boolean;
  unreadMessages?: number;
}) {
  const pathname = usePathname() ?? '';
  const [collapsed, setCollapsedRaw] = useState(() => loadCollapsed());
  const setCollapsed = useCallback((v: boolean) => {
    setCollapsedRaw(v);
    saveCollapsed(v);
  }, []);
  const [openGroups, setOpenGroups] = useState<Record<NavCategory, boolean>>(() => loadOpenGroups());
  const [mobileOpen, setMobileOpen] = useState(false);
  const initialPathname = useRef(pathname);
  const items = NAV.filter((n) =>
    n.roles.includes(role) && (n.href !== '/stores' || isMultiStore),
  ).map((item) => item.href === '/messages' ? { ...item, badge: unreadMessages } : item);
  const activeCategory = items.find((item) => pathname === item.href || pathname.startsWith(item.href + '/'))?.category;

  const toggleGroup = useCallback((category: NavCategory) => {
    setOpenGroups((current) => {
      const next = { ...current, [category]: !current[category] };
      saveOpenGroups(next);
      return next;
    });
  }, []);

  // Never leave the current route hidden after navigation.
  useEffect(() => {
    if (!activeCategory || pathname === initialPathname.current) return;
    setOpenGroups((current) => {
      if (current[activeCategory]) return current;
      const next = { ...current, [activeCategory]: true };
      saveOpenGroups(next);
      return next;
    });
  }, [activeCategory, pathname]);

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

        {/* Persistent grouped navigation. */}
        <nav className="min-h-0 flex-1 overflow-y-auto scroll-thin p-3">
          <NavItems
            items={items}
            pathname={pathname}
            collapsed={collapsed}
            openGroups={openGroups}
            onToggleGroup={toggleGroup}
            idPrefix="desktop"
          />
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
              <NavItems
                  items={items}
                  pathname={pathname}
                  collapsed={false}
                  openGroups={openGroups}
                  onToggleGroup={toggleGroup}
                  onNavigate={() => setMobileOpen(false)}
                  idPrefix="mobile"
                />
            </nav>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  );
}
