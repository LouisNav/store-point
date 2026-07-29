// Domain types shared between layers.
// Field names use camelCase; SQLite stores as TEXT/INTEGER with conversions.

export type Role =
  | 'ROOT_ADMIN' // global, cross-store superuser
  | 'MANAGER' // store admin (pricing, users, brand)
  | 'INVENTORY' // stock ops, no cost visibility
  | 'SALES_AGENT' // POS only, no cost
  | 'VIEWER';

export const ROLES: Role[] = [
  'ROOT_ADMIN',
  'MANAGER',
  'INVENTORY',
  'SALES_AGENT',
  'VIEWER',
];

export type PaymentMethod = 'cash' | 'mobile' | 'card' | 'other';
export type SaleStatus = 'completed' | 'refunded' | 'partial_refund';

export interface User {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  isRoot: 0 | 1;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface Membership {
  id: string;
  userId: string;
  storeId: string;
  role: Role;
  active: 0 | 1;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface Brand {
  accent?: string; // hex color like "#0ea5e9"
  accentFg?: string;
  logoDataUrl?: string; // data URL for self-contained branding
  tagline?: string;
  currencySymbol?: string; // override ISO symbol e.g. "₦", "$", "KES"
}

export interface Store {
  id: string;
  slug: string;
  name: string;
  currency: string;
  brandJson: string; // JSON of Brand
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface Product {
  id: string;
  storeId: string;
  sku: string;
  name: string;
  description: string;
  costCents: number;
  sellCents: number;
  stockQty: number;
  lowStockThreshold: number;
  active: 0 | 1;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface Customer {
  id: string;
  storeId: string;
  name: string;
  phone: string;
  email: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface Sale {
  id: string;
  storeId: string;
  customerId: string | null;
  cashierId: string;
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  paymentMethod: PaymentMethod;
  receiptNumber: string;
  status: SaleStatus;
  note: string;
  idempotencyKey: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface SaleItem {
  id: string;
  saleId: string;
  productId: string;
  productName: string;
  productSku: string;
  qty: number;
  sellCentsSnapshot: number;
  lineTotalCents: number;
}

export interface Refund {
  id: string;
  storeId: string;
  saleId: string;
  cashierId: string;
  totalRefundCents: number;
  reason: string;
  idempotencyKey: string | null;
  createdAt: string;
}

export interface RefundItem {
  id: string;
  refundId: string;
  saleItemId: string;
  qty: number;
  refundCents: number;
}

export interface OutboxRow {
  id: number;
  op: 'upsert' | 'soft_delete';
  collection: string;
  docId: string;
  payloadJson: string;
  createdAt: string;
  syncedAt: string | null;
}

/** Helper: now as ISO timestamp. */
export function nowISO(): string {
  return new Date().toISOString();
}
