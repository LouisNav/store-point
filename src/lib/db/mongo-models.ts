// Mongoose schemas mirroring SQLite. Used only by the sync worker to drain outbox.

import mongoose, { Schema } from 'mongoose';

const ts = { type: String, required: true };

const UserSchema = new Schema(
  {
    _id: { type: String, required: true },
    email: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    passwordHash: String,
    isRoot: { type: Boolean, default: false },
    createdAt: ts,
    updatedAt: ts,
    deletedAt: String,
  },
  { _id: false, versionKey: false, strict: false },
);

const StoreSchema = new Schema(
  {
    _id: { type: String, required: true },
    slug: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    currency: { type: String, default: 'USD' },
    brandJson: { type: String, default: '{}' },
    createdAt: ts,
    updatedAt: ts,
    deletedAt: String,
  },
  { _id: false, versionKey: false, strict: false },
);

const MembershipSchema = new Schema(
  {
    _id: { type: String, required: true },
    userId: { type: String, required: true, index: true },
    storeId: { type: String, required: true, index: true },
    role: { type: String, required: true },
    active: { type: Boolean, default: true },
    createdAt: ts,
    updatedAt: ts,
    deletedAt: String,
  },
  { _id: false, versionKey: false, strict: false },
);

const ChannelSchema = new Schema(
  {
    _id: { type: String, required: true },
    storeId: { type: String, required: true, index: true },
    slug: { type: String, required: true },
    name: { type: String, required: true },
    description: { type: String, default: '' },
    kind: { type: String, required: true },
    directKey: { type: String, index: true, sparse: true },
    createdById: { type: String, required: true },
    createdAt: ts,
    updatedAt: ts,
    deletedAt: String,
  },
  { _id: false, versionKey: false, strict: false, indexes: [{ key: { storeId: 1, slug: 1 }, unique: true }] },
);

const ChannelParticipantSchema = new Schema(
  {
    _id: { type: String, required: true },
    channelId: { type: String, required: true, index: true },
    storeId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    createdAt: ts,
  },
  { _id: false, versionKey: false, strict: false },
);

const MessageSchema = new Schema(
  {
    _id: { type: String, required: true },
    storeId: { type: String, required: true, index: true },
    channelId: { type: String, required: true, index: true },
    authorId: { type: String, required: true },
    parentId: String,
    body: { type: String, required: true },
    reactionsJson: { type: String, default: '{}' },
    pinned: { type: Boolean, default: false },
    requiresAck: { type: Boolean, default: false },
    editedAt: String,
    createdAt: ts,
    updatedAt: ts,
    deletedAt: String,
  },
  { _id: false, versionKey: false, strict: false },
);

const MessageRevisionSchema = new Schema(
  {
    _id: { type: String, required: true },
    storeId: { type: String, required: true, index: true },
    messageId: { type: String, required: true, index: true },
    version: { type: Number, required: true },
    body: { type: String, required: true },
    revisedById: { type: String, required: true },
    createdAt: ts,
  },
  { _id: false, versionKey: false, strict: false, indexes: [{ key: { messageId: 1, version: 1 }, unique: true }] },
);

const MessageAcknowledgmentSchema = new Schema(
  {
    _id: { type: String, required: true },
    messageId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    acknowledgedAt: ts,
  },
  { _id: false, versionKey: false, strict: false },
);

const MessageAuditSchema = new Schema(
  {
    _id: { type: String, required: true },
    storeId: { type: String, required: true, index: true },
    messageId: String,
    channelId: String,
    actorId: { type: String, required: true },
    action: { type: String, required: true },
    metadataJson: { type: String, default: '{}' },
    createdAt: ts,
  },
  { _id: false, versionKey: false, strict: false },
);

const GlobalAnnouncementSchema = new Schema(
  {
    _id: { type: String, required: true },
    title: { type: String, required: true },
    body: { type: String, required: true },
    priority: { type: String, default: 'normal' },
    requiresAck: { type: Boolean, default: false },
    createdById: { type: String, required: true },
    publishedAt: ts,
    expiresAt: String,
    createdAt: ts,
    updatedAt: ts,
    deletedAt: String,
  },
  { _id: false, versionKey: false, strict: false },
);

const GlobalAnnouncementAcknowledgmentSchema = new Schema(
  {
    _id: { type: String, required: true },
    announcementId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    storeId: { type: String, required: true, index: true },
    acknowledgedAt: ts,
  },
  { _id: false, versionKey: false, strict: false },
);

const GlobalAnnouncementAuditSchema = new Schema(
  {
    _id: { type: String, required: true },
    announcementId: { type: String, index: true },
    actorId: { type: String, required: true },
    action: { type: String, required: true },
    metadataJson: { type: String, default: '{}' },
    createdAt: ts,
  },
  { _id: false, versionKey: false, strict: false },
);

const AuditEventSchema = new Schema(
  {
    _id: { type: String, required: true },
    storeId: { type: String, index: true },
    actorId: { type: String, index: true },
    actorEmail: String,
    action: { type: String, required: true, index: true },
    entityType: String,
    entityId: String,
    metadataJson: { type: String, default: '{}' },
    ip: String,
    createdAt: ts,
  },
  { _id: false, versionKey: false, strict: false },
);

const InventoryAuditSchema = new Schema(
  {
    _id: { type: String, required: true },
    storeId: { type: String, required: true, index: true },
    productId: { type: String, required: true, index: true },
    actorId: { type: String, required: true },
    delta: { type: Number, required: true },
    beforeQty: { type: Number, required: true },
    afterQty: { type: Number, required: true },
    reason: { type: String, required: true },
    createdAt: ts,
  },
  { _id: false, versionKey: false, strict: false },
);

const ProductSchema = new Schema(
  {
    _id: { type: String, required: true },
    storeId: { type: String, required: true, index: true },
    sku: { type: String, required: true, index: true },
    name: { type: String, required: true },
    description: { type: String, default: '' },
    costCents: { type: Number, default: 0 },
    sellCents: { type: Number, default: 0 },
    stockQty: { type: Number, default: 0 },
    lowStockThreshold: { type: Number, default: 5 },
    active: { type: Boolean, default: true },
    createdAt: ts,
    updatedAt: ts,
    deletedAt: String,
  },
  { _id: false, versionKey: false, strict: false, indexes: [{ key: { storeId: 1, sku: 1 }, unique: true }] },
);

const CustomerSchema = new Schema(
  {
    _id: { type: String, required: true },
    storeId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    phone: { type: String, default: '' },
    email: { type: String, default: '' },
    notes: { type: String, default: '' },
    createdAt: ts,
    updatedAt: ts,
    deletedAt: String,
  },
  { _id: false, versionKey: false, strict: false },
);

const SaleSchema = new Schema(
  {
    _id: { type: String, required: true },
    storeId: { type: String, required: true, index: true },
    customerId: String,
    cashierId: { type: String, required: true },
    subtotalCents: Number,
    discountCents: { type: Number, default: 0 },
    totalCents: { type: Number, required: true },
    paymentMethod: { type: String, default: 'cash' },
    receiptNumber: { type: String, required: true },
    status: { type: String, default: 'completed' },
    note: { type: String, default: '' },
    idempotencyKey: { type: String, index: true, sparse: true },
    createdAt: ts,
    updatedAt: ts,
    deletedAt: String,
  },
  { _id: false, versionKey: false, strict: false },
);

const SaleItemSchema = new Schema(
  {
    _id: { type: String, required: true },
    saleId: { type: String, required: true, index: true },
    productId: { type: String, required: true },
    productName: String,
    productSku: String,
    qty: Number,
    sellCentsSnapshot: Number,
    lineTotalCents: Number,
  },
  { _id: false, versionKey: false, strict: false },
);

const RefundSchema = new Schema(
  {
    _id: { type: String, required: true },
    storeId: { type: String, required: true, index: true },
    saleId: { type: String, required: true, index: true },
    cashierId: String,
    totalRefundCents: Number,
    reason: { type: String, default: '' },
    idempotencyKey: { type: String, index: true, sparse: true },
    createdAt: ts,
  },
  { _id: false, versionKey: false, strict: false },
);

const RefundItemSchema = new Schema(
  {
    _id: { type: String, required: true },
    refundId: { type: String, required: true, index: true },
    saleItemId: { type: String, required: true },
    qty: Number,
    refundCents: Number,
  },
  { _id: false, versionKey: false, strict: false },
);
// reuse same collection name so duplicate model registration errors don't fire
export const M = {
  User: mongoose.models.User || mongoose.model('User', UserSchema),
  Store: mongoose.models.Store || mongoose.model('Store', StoreSchema),
  Membership: mongoose.models.Membership || mongoose.model('Membership', MembershipSchema),
  Channel: mongoose.models.Channel || mongoose.model('Channel', ChannelSchema),
  ChannelParticipant: mongoose.models.ChannelParticipant || mongoose.model('ChannelParticipant', ChannelParticipantSchema),
  Message: mongoose.models.Message || mongoose.model('Message', MessageSchema),
  MessageRevision: mongoose.models.MessageRevision || mongoose.model('MessageRevision', MessageRevisionSchema),
  MessageAcknowledgment: mongoose.models.MessageAcknowledgment || mongoose.model('MessageAcknowledgment', MessageAcknowledgmentSchema),
  MessageAudit: mongoose.models.MessageAudit || mongoose.model('MessageAudit', MessageAuditSchema),
  InventoryAudit: mongoose.models.InventoryAudit || mongoose.model('InventoryAudit', InventoryAuditSchema),
  AuditEvent: mongoose.models.AuditEvent || mongoose.model('AuditEvent', AuditEventSchema),
  GlobalAnnouncement: mongoose.models.GlobalAnnouncement || mongoose.model('GlobalAnnouncement', GlobalAnnouncementSchema),
  GlobalAnnouncementAcknowledgment: mongoose.models.GlobalAnnouncementAcknowledgment || mongoose.model('GlobalAnnouncementAcknowledgment', GlobalAnnouncementAcknowledgmentSchema),
  GlobalAnnouncementAudit: mongoose.models.GlobalAnnouncementAudit || mongoose.model('GlobalAnnouncementAudit', GlobalAnnouncementAuditSchema),
  Product: mongoose.models.Product || mongoose.model('Product', ProductSchema),
  Customer: mongoose.models.Customer || mongoose.model('Customer', CustomerSchema),
  Sale: mongoose.models.Sale || mongoose.model('Sale', SaleSchema),
  SaleItem: mongoose.models.SaleItem || mongoose.model('SaleItem', SaleItemSchema),
  Refund: mongoose.models.Refund || mongoose.model('Refund', RefundSchema),
  RefundItem: mongoose.models.RefundItem || mongoose.model('RefundItem', RefundItemSchema),
};
