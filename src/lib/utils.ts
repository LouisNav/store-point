// Generic utility helpers.

import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format } from 'date-fns';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format cents into a money string.
 * Example: formatMoney(125099, 'USD') -> "$1,250.99"
 * If symbolOverride is provided, it replaces the ISO currency symbol.
 */
export function formatMoney(cents: number, currency = 'USD', symbolOverride?: string): string {
  try {
    if (symbolOverride) {
      // Format as a plain number with locale-aware separators, then prepend the symbol.
      const num = new Intl.NumberFormat(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(cents / 100);
      return `${symbolOverride} ${num}`;
    }
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
    }).format(cents / 100);
  } catch {
    const sym = symbolOverride || currency;
    return `${sym} ${(cents / 100).toFixed(2)}`;
  }
}

/**
 * Parse a store's brandJson and return the currency symbol override if set.
 * Use with formatMoney(cents, store.currency, getCurrencySymbol(store.brandJson)).
 */
export function getCurrencySymbol(brandJson: string | null | undefined): string | undefined {
  if (!brandJson) return undefined;
  try {
    const brand = JSON.parse(brandJson);
    return brand.currencySymbol || undefined;
  } catch {
    return undefined;
  }
}

export function formatDate(d: Date | string): string {
  return format(new Date(d), 'PPp');
}

export function formatDateShort(d: Date | string): string {
  return format(new Date(d), 'PP');
}

export function truncate(s: string, n = 60): string {
  return s.length <= n ? s : s.slice(0, n - 1) + '\u2026';
}

/** Compute profit margin % given cost and sell price (cents). Returns 0 if cost===0. */
export function marginPct(costCents: number, sellCents: number): number {
  if (costCents <= 0) return 0;
  return Math.round(((sellCents - costCents) / costCents) * 1000) / 10;
}
