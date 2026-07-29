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
  Product: mongoose.models.Product || mongoose.model('Product', ProductSchema),
  Customer: mongoose.models.Customer || mongoose.model('Customer', CustomerSchema),
  Sale: mongoose.models.Sale || mongoose.model('Sale', SaleSchema),
  SaleItem: mongoose.models.SaleItem || mongoose.model('SaleItem', SaleItemSchema),
  Refund: mongoose.models.Refund || mongoose.model('Refund', RefundSchema),
  RefundItem: mongoose.models.RefundItem || mongoose.model('RefundItem', RefundItemSchema),
};
