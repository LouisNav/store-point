'use client';
import { useEffect, useState } from 'react';
import { X, Lightbulb } from 'lucide-react';
import type { Role } from '@/lib/types';
import { ROLE_DESCRIPTION, can, Permission } from '@/lib/rbac';

const STORAGE_PREFIX = 'storepoint:dismissed:role-overview:';

interface Props {
  role: Role;
  storeName: string;
  userName: string;
}

/**
 * First-login overview for non-root users. Explains what they CAN do
 * and how to be effective in the store. Persists per-role so a
 * role change re-shows the banner. Hidden for ROOT_ADMIN.
 */
export function RoleAnnouncementBanner({ role, storeName, userName }: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (role === 'ROOT_ADMIN') return;
    try {
      const key = STORAGE_PREFIX + role;
      if (window.localStorage.getItem(key) === '1') return;
    } catch {
      /* localStorage may be blocked — show the banner anyway */
    }
    setVisible(true);
  }, [role]);

  if (!visible) return null;

  function dismiss() {
    try {
      window.localStorage.setItem(STORAGE_PREFIX + role, '1');
    } catch {
      /* ignore */
    }
    setVisible(false);
  }

  // Derive UI hints from the RBAC table, not raw role names, so if the
  // permission matrix shifts the banner stays correctly aligned with the
  // rest of the app.
  const canSell = can(role, Permission.SalesCreate);
  const canManageStaff = can(role, Permission.UsersManage);

  return (
    <div
      role="dialog"
      aria-live="polite"
      className="mb-6 flex items-start gap-3 rounded-lg border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950 shadow-sm"
    >
      <Lightbulb className="mt-0.5 h-5 w-5 shrink-0 text-sky-600" />
      <div className="flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-base font-semibold">Welcome, {userName}!</span>
          <span className="rounded-full bg-sky-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
            {role.replace('_', ' ')}
          </span>
          <span className="text-xs text-sky-700">on {storeName}</span>
        </div>
        <p className="leading-relaxed">{ROLE_DESCRIPTION[role]}</p>
        <ul className="mt-2 grid gap-1 text-xs sm:grid-cols-2">
          {canSell && (
            <li>
              ✅ <strong>Cash Register (POS):</strong> process sales for walk-ins or known customers.
            </li>
          )}
          <li>
            ✅ <strong>Products & customers:</strong> browse, search, and use them at the till.
          </li>
          {canManageStaff && (
            <li>
              ✅ <strong>Staff & roles:</strong> invite team members and assign their roles.
            </li>
          )}

        </ul>
      </div>
      <button
        type="button"
        onClick={dismiss}
        className="rounded-md p-1 text-sky-700 transition-colors hover:bg-sky-100 hover:text-sky-900"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
