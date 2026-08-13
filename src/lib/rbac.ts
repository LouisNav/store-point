// RBAC: roles -> permission keys. Code-defined for V1 (we can move to DB later).
// Field-level visibility helpers (e.g. SALES_AGENT never sees `costCents`).

import type { Role } from './types';
import type { Product } from './types';
import { ROLES } from './types';

export const Permission = {
  StoreSelect: 'store:select',
  StoreManage: 'store:manage',
  StoreBrand: 'store:brand',
  UsersManage: 'users:manage',
  ProductsRead: 'products:read',
  ProductsReadCost: 'products:read-cost',
  ProductsWrite: 'products:write',
  StockAdjust: 'stock:adjust',
  CustomersRead: 'customers:read',
  CustomersWrite: 'customers:write',
  SalesCreate: 'sales:create',
  SalesRefund: 'sales:refund',
  SalesRead: 'sales:read',
  ReportsCashup: 'reports:cashup',
  ReportsProfit: 'reports:profit',
  SyncStatus: 'sync:status',
  MessagingRead: 'messaging:read',
  MessagingWrite: 'messaging:write',
  MessagingDirect: 'messaging:direct',
  MessagingAnnouncement: 'messaging:announcement',
  MessagingModerate: 'messaging:moderate',
  MessagingAudit: 'messaging:audit',
  GlobalAnnouncementManage: 'global-announcement:manage',
  AuditRead: 'audit:read',
} as const;
export type PermissionKey = (typeof Permission)[keyof typeof Permission];

export { ROLES };

export const ROLE_PERMISSIONS: Record<Role, PermissionKey[]> = {
  ROOT_ADMIN: Object.values(Permission),
  MANAGER: [
    Permission.StoreSelect,
    Permission.StoreBrand,
    Permission.UsersManage,
    Permission.ProductsRead,
    Permission.ProductsReadCost,
    Permission.ProductsWrite,
    Permission.StockAdjust,
    Permission.CustomersRead,
    Permission.CustomersWrite,
    Permission.SalesCreate,
    Permission.SalesRefund,
    Permission.SalesRead,
    Permission.ReportsCashup,
    Permission.ReportsProfit,
    Permission.MessagingRead,
    Permission.MessagingWrite,
    Permission.MessagingDirect,
    Permission.MessagingAnnouncement,
    Permission.MessagingModerate,
    Permission.MessagingAudit,
    Permission.AuditRead,
  ],
  INVENTORY: [
    Permission.StoreSelect,
    Permission.ProductsRead,
    Permission.StockAdjust,
    Permission.CustomersRead,
    Permission.MessagingRead,
    Permission.MessagingWrite,
  ],
  SALES_AGENT: [
    Permission.StoreSelect,
    Permission.ProductsRead,
    Permission.CustomersRead,
    Permission.CustomersWrite,
    Permission.SalesCreate,
    Permission.SalesRead,
    Permission.MessagingRead,
    Permission.MessagingWrite,
  ],
  VIEWER: [
    Permission.StoreSelect,
    Permission.ProductsRead,
    Permission.CustomersRead,
    Permission.SalesRead,
    Permission.MessagingRead,
  ],
};

export function can(role: Role | undefined, perm: PermissionKey): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role].includes(perm);
}

export function canAny(role: Role | undefined, perms: PermissionKey[]): boolean {
  return perms.some((p) => can(role, p));
}

/**
 * Strip out cost fields from a product so SALES_AGENT never sees internal price.
 */
export function stripProduct(
  p: Product,
  role: Role | undefined,
): Partial<Product> & {
  id: string;
  name: string;
  sku: string;
  sellCents: number;
  stockQty: number;
  active: 0 | 1;
} {
  const base = {
    id: p.id,
    sku: p.sku,
    name: p.name,
    sellCents: p.sellCents,
    stockQty: p.stockQty,
    active: p.active,
    description: p.description,
    lowStockThreshold: p.lowStockThreshold,
  };
  if (can(role, Permission.ProductsReadCost)) {
    return { ...base, costCents: p.costCents };
  }
  return base;
}

export function stripProductList(products: Product[], role: Role | undefined) {
  return products.map((p) => stripProduct(p, role));
}

export function canSeeCost(role: Role | undefined): boolean {
  return can(role, Permission.ProductsReadCost);
}

export function canSeeProfit(role: Role | undefined): boolean {
  return can(role, Permission.ReportsProfit);
}

export const ROLE_LABEL: Record<Role, string> = {
  ROOT_ADMIN: 'Root Admin',
  MANAGER: 'Manager',
  INVENTORY: 'Inventory',
  SALES_AGENT: 'Sales Agent',
  VIEWER: 'Viewer',
};

export const ROLE_DESCRIPTION: Record<Role, string> = {
  ROOT_ADMIN: 'Full access to all stores and platform settings.',
  MANAGER: 'Manages products, pricing, staff, brand, and reports for their store.',
  INVENTORY: 'Handles stock in/out and product listings.',
  SALES_AGENT: 'Processes sales at the till — search products, build carts, complete checkouts.',
  VIEWER: 'Read-only access to products, customers, and sales.',
};
