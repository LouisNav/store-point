import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireActiveStore, can } from '@/lib/auth/guards';
import { Permission } from '@/lib/rbac';
import { salesRepo } from '@/lib/db/repositories/sales.repo';
import { storesRepo } from '@/lib/db/repositories/stores.repo';
import { productsRepo } from '@/lib/db/repositories/products.repo';
import { customersRepo } from '@/lib/db/repositories/customers.repo';
import { usersRepo } from '@/lib/db/repositories/users.repo';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatMoney, formatDate, marginPct, getCurrencySymbol } from '@/lib/utils';
import { Printer, Receipt } from 'lucide-react';
import { RefundDialog } from './refund-dialog';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function SaleDetailPage({ params }: PageProps) {
  const { id } = await params;
  const { storeId, role } = await requireActiveStore();
  const store = storesRepo.byId(storeId)!;
  const sale = salesRepo.byId(storeId, id);
  if (!sale) notFound();
  const items = salesRepo.items(sale.id);
  const refunds = salesRepo.refundsForSale(sale.id);
  const cashier = usersRepo.byId(sale.cashierId);
  const customer = sale.customerId ? customersRepo.byId(storeId, sale.customerId) : null;

  const canSeeCost = can(role, Permission.ProductsReadCost);
  const sym = getCurrencySymbol(store.brandJson);

  return (
    <div>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <Receipt className="h-6 w-6 text-primary" />
            {sale.receiptNumber}
          </span>
        }
        description={`${formatDate(sale.createdAt)} · ${sale.paymentMethod}`}
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link href={`/sales/${sale.id}/receipt`}>
                <Printer className="h-4 w-4" /> Receipt
              </Link>
            </Button>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Items */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Items</CardTitle>
            <CardDescription>
              {items.length} line · Subtotal {formatMoney(sale.subtotalCents, store.currency, sym)}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table className="min-w-[500px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-center">Qty</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  {canSeeCost && <TableHead className="text-right">Margin</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((it) => {
                  const product = productsRepo.list(storeId).find((p) => p.id === it.productId);
                  return (
                    <TableRow key={it.id}>
                      <TableCell>
                        <div className="font-medium">{it.productName}</div>
                        <div className="text-xs text-muted-foreground">SKU {it.productSku}</div>
                      </TableCell>
                      <TableCell className="text-right">{formatMoney(it.sellCentsSnapshot, store.currency, sym)}</TableCell>
                      <TableCell className="text-center">{it.qty}</TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatMoney(it.lineTotalCents, store.currency, sym)}
                      </TableCell>
                      {canSeeCost && (
                        <TableCell className="text-right">
                          {product ? (
                            <span className={marginPct(product.costCents, it.sellCentsSnapshot) > 30 ? 'text-success' : 'text-muted-foreground'}>
                              {marginPct(product.costCents, it.sellCentsSnapshot)}%
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Sidebar */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row label="Subtotal" value={formatMoney(sale.subtotalCents, store.currency, sym)} />
              <Row label="Discount" value={`-${formatMoney(sale.discountCents, store.currency, sym)}`} />
              <div className="my-2 h-px bg-border" />
              <div className="flex items-center justify-between text-lg font-semibold">
                <span>Total</span>
                <span>{formatMoney(sale.totalCents, store.currency, sym)}</span>
              </div>
              <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                <div>Cashier: <span className="font-medium text-foreground">{cashier?.name ?? '—'}</span></div>
                <div>Customer: <span className="font-medium text-foreground">{customer?.name ?? 'Walk-in'}</span></div>
                <div>Status: <Badge variant={sale.status === 'completed' ? 'secondary' : sale.status === 'refunded' ? 'destructive' : 'warning'}>{sale.status.replace('_', ' ')}</Badge></div>
              </div>
            </CardContent>
          </Card>

          {/* Refunds */}
          {refunds.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Refunds</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {refunds.map((r) => (
                  <div key={r.id} className="rounded-md border p-3">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">{formatMoney(r.totalRefundCents, store.currency, sym)}</span>
                      <span className="text-xs text-muted-foreground">{new Date(r.createdAt).toLocaleString()}</span>
                    </div>
                    {r.reason && <p className="mt-1 text-xs text-muted-foreground">{r.reason}</p>}
                    <ul className="mt-1 space-y-0.5 text-xs">
                      {r.items.map((it) => (
                        <li key={it.id} className="text-muted-foreground">
                          × {it.qty} — refund {formatMoney(it.refundCents, store.currency, sym)}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {can(role, Permission.SalesRefund) && sale.status !== 'refunded' && (
            <div className="flex justify-end">
              <RefundDialog
                saleId={sale.id}
                currency={store.currency}
                currencySymbol={sym}
                items={items.map((it) => ({
                  id: it.id,
                  label: `${it.qty}× ${it.productName}`,
                  maxQty: it.qty,
                  refundCentsPerUnit: it.sellCentsSnapshot,
                }))}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
