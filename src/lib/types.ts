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
export type ChannelKind = 'general' | 'announcement' | 'direct';
export type MessageAuditAction = 'created' | 'edited' | 'deleted' | 'reaction_added' | 'reaction_removed' | 'pinned' | 'unpinned' | 'read' | 'acknowledged';
export type NotificationKind = 'message' | 'announcement' | 'global_announcement' | 'low_stock';

/** Unified, append-only activity log across the platform. */
export type AuditAction =
  | 'auth.login_success'
  | 'auth.login_failure'
  | 'user.invite'
  | 'user.role_change'
  | 'user.suspend'
  | 'user.reactivate'
  | 'user.remove'
  | 'product.create'
  | 'product.update'
  | 'product.delete'
  | 'store.switch'
  | 'announcement.create';

export interface AuditEvent {
  id: string;
  storeId: string | null;
  actorId: string | null;
  actorEmail: string | null;
  action: AuditAction;
  entityType: string | null;
  entityId: string | null;
  metadataJson: string;
  ip: string | null;
  createdAt: string;
}
export type NotificationPriority = 'normal' | 'high';
export type GlobalAnnouncementPriority = 'normal' | 'high' | 'critical';

export interface Channel {
  id: string;
  storeId: string;
  slug: string;
  name: string;
  description: string;
  kind: ChannelKind;
  directKey?: string | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface Message {
  id: string;
  storeId: string;
  channelId: string;
  authorId: string;
  parentId: string | null;
  body: string;
  reactions: Record<string, string[]>;
  pinned: 0 | 1;
  requiresAck: 0 | 1;
  editedAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface MessageAudit {
  id: string;
  storeId: string;
  messageId: string | null;
  channelId: string | null;
  actorId: string;
  action: MessageAuditAction;
  metadataJson: string;
  createdAt: string;
}

/** Append-only body history retained for compliance and dispute resolution. */
export interface MessageRevision {
  id: string;
  storeId: string;
  messageId: string;
  version: number;
  body: string;
  revisedById: string;
  createdAt: string;
}

export interface MessageSeenState {
  seen: boolean;
  seenAt: string | null;
}

export interface DirectConversation {
  channel: Channel;
  partnerId: string;
  partnerName: string;
  partnerEmail: string;
  unread: number;
  lastMessageBody: string | null;
  lastMessageAt: string | null;
}

export interface DirectTarget {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export interface ChannelRead {
  channelId: string;
  userId: string;
  lastReadAt: string;
  updatedAt: string;
}

export interface MessageAcknowledgment {
  messageId: string;
  userId: string;
  acknowledgedAt: string;
}

export interface ChannelUnread {
  channelId: string;
  unread: number;
}

export interface UnreadSummary {
  total: number;
  channels: ChannelUnread[];
}

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

export interface GlobalAnnouncement {
  id: string;
  title: string;
  body: string;
  priority: GlobalAnnouncementPriority;
  requiresAck: 0 | 1;
  createdById: string;
  publishedAt: string;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface GlobalAnnouncementAcknowledgment {
  announcementId: string;
  userId: string;
  storeId: string;
  acknowledgedAt: string;
}

export interface GlobalAnnouncementAudit {
  id: string;
  announcementId: string | null;
  actorId: string;
  action: 'created' | 'acknowledged' | 'deleted';
  metadataJson: string;
  createdAt: string;
}

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  priority: NotificationPriority;
  title: string;
  body: string;
  href: string;
  createdAt: string;
}

export interface InventoryAudit {
  id: string;
  storeId: string;
  productId: string;
  actorId: string;
  delta: number;
  beforeQty: number;
  afterQty: number;
  reason: string;
  createdAt: string;
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
