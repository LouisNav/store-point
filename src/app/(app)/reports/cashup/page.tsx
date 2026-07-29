import { requireActiveStore, can } from '@/lib/auth/guards';
import { Permission } from '@/lib/rbac';
import { salesRepo } from '@/lib/db/repositories/sales.repo';
import { storesRepo } from '@/lib/db/repositories/stores.repo';
import { productsRepo } from '@/lib/db/repositories/products.repo';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { SalesChart } from './sales-chart';
import { formatMoney, getCurrencySymbol } from '@/lib/utils';
import { Calculator, Receipt, ShoppingCart, Wallet, TrendingDown } from 'lucide-react';

export default async function CashUpPage() {
  const { storeId, role } = await requireActiveStore();
  if (!can(role, Permission.ReportsCashup)) {
    return (
      <div>
        <PageHeader title="Daily cash-up" />
        <p className="text-muted-foreground">You don't have access to this report.</p>
      </div>
    );
  }
  const store = storesRepo.byId(storeId)!;
  const sym = getCurrencySymbol(store.brandJson);
  const today = salesRepo.dailySummary(storeId, new Date());
  const series = salesRepo.dailyTimeSeries(storeId, 14);
  const lowStock = productsRepo.lowStock(storeId, 8);

  const paymentRows = Object.entries(today.byPaymentMethod).map(([k, v]) => ({ method: k, ...v }));

  return (
    <div>
      <PageHeader
        title="Daily cash-up"
        description={`Summary for ${new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={<ShoppingCart className="h-5 w-5" />} title="Transactions" value={String(today.count)} subtitle="count today" />
        <Stat tone="primary" icon={<Receipt className="h-5 w-5" />} title="Gross sales" value={formatMoney(today.totalCents, store.currency, sym)} subtitle="before refunds" />
        <Stat tone="destructive" icon={<TrendingDown className="h-5 w-5" />} title="Refunds" value={formatMoney(today.refundsCents, store.currency, sym)} subtitle={`${today.refundsCount} refunded`} />
        <Stat tone="success" icon={<Wallet className="h-5 w-5" />} title="Net cash" value={formatMoney(today.totalCents - today.refundsCents, store.currency, sym)} subtitle="sales − refunds" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Last 14 days</CardTitle>
            <CardDescription>Daily sales trend</CardDescription>
          </CardHeader>
          <CardContent>
            <SalesChart series={series} currency={store.currency} currencySymbol={sym} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Payment breakdown</CardTitle>
            <CardDescription>Today, by method</CardDescription>
          </CardHeader>
          <CardContent>
            {paymentRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No transactions yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Method</TableHead>
                    <TableHead className="text-right">Count</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paymentRows.map((r) => (
                    <TableRow key={r.method}>
                      <TableCell className="capitalize">{r.method}</TableCell>
                      <TableCell className="text-right">{r.count}</TableCell>
                      <TableCell className="text-right font-medium">{formatMoney(r.cents, store.currency, sym)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Calculator className="h-4 w-4" /> Inventory alerts</CardTitle>
            <CardDescription>Products at or below their low-stock threshold.</CardDescription>
          </CardHeader>
          <CardContent>
            {lowStock.length === 0 ? (
              <p className="text-sm text-muted-foreground">No alerts. You're well stocked! 🎉</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead className="text-right">Stock</TableHead>
                    <TableHead className="text-right">Threshold</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lowStock.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell className="text-muted-foreground">{p.sku}</TableCell>
                      <TableCell className="text-right"><Badge variant="warning">{p.stockQty}</Badge></TableCell>
                      <TableCell className="text-right">{p.lowStockThreshold}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Stat({
  title,
  value,
  subtitle,
  icon,
  tone = 'default',
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: React.ReactNode;
  tone?: 'default' | 'primary' | 'success' | 'destructive';
}) {
  const ring = {
    default: 'bg-muted text-foreground',
    primary: 'bg-primary/15 text-primary',
    success: 'bg-success/15 text-success',
    destructive: 'bg-destructive/15 text-destructive',
  }[tone];
  return (
    <Card>
      <CardContent className="flex items-start justify-between p-5">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">{title}</div>
          <div className="mt-1 text-2xl font-semibold tracking-tight">{value}</div>
          <div className="mt-1 text-xs text-muted-foreground">{subtitle}</div>
        </div>
        <div className={`flex h-10 w-10 items-center justify-center rounded-md ${ring}`}>{icon}</div>
      </CardContent>
    </Card>
  );
}
