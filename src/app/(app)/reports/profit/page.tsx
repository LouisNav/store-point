import { requireActiveStore, can } from '@/lib/auth/guards';
import { Permission } from '@/lib/rbac';
import { salesRepo } from '@/lib/db/repositories/sales.repo';
import { storesRepo } from '@/lib/db/repositories/stores.repo';
import { productsRepo } from '@/lib/db/repositories/products.repo';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { formatMoney, marginPct, getCurrencySymbol } from '@/lib/utils';

export default async function ProfitPage() {
  const { storeId, role } = await requireActiveStore();
  if (!can(role, Permission.ReportsProfit)) {
    return (
      <div>
        <PageHeader title="Profit report" />
        <p className="text-muted-foreground">You don't have access to profit information.</p>
      </div>
    );
  }
  const store = storesRepo.byId(storeId)!;
  const sym = getCurrencySymbol(store.brandJson);
  const today = salesRepo.todaysProfit(storeId);
  const products = productsRepo.list(storeId).filter((p) => p.active);

  const totalStockValue = products.reduce((a, p) => a + p.costCents * p.stockQty, 0);
  const totalPotentialRev = products.reduce((a, p) => a + p.sellCents * p.stockQty, 0);
  const stockProfit = totalPotentialRev - totalStockValue;

  return (
    <div>
      <PageHeader
        title="Profit report"
        description="Today's profit, margin analysis, and per-product performance breakdown."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Today's profit</CardTitle>
            <CardDescription>From completed sales</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatMoney(today.profitCents, store.currency, sym)}</div>
            <p className="mt-1 text-xs text-muted-foreground">
              Revenue {formatMoney(today.revenueCents, store.currency, sym)} · Cost {formatMoney(today.costCents, store.currency, sym)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Today's margin</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {today.revenueCents > 0 ? `${Math.round((today.profitCents / today.revenueCents) * 100)}%` : '—'}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Stock potential profit</CardTitle>
            <CardDescription>If you sold every unit on hand at sell price</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatMoney(stockProfit, store.currency, sym)}</div>
            <p className="mt-1 text-xs text-muted-foreground">
              Cost {formatMoney(totalStockValue, store.currency, sym)} · Potential {formatMoney(totalPotentialRev, store.currency, sym)}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Per-product margins</CardTitle>
          <CardDescription>Live products, sorted by margin absolute value.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table className="min-w-[500px]">
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="text-right">Margin</TableHead>
                <TableHead className="text-right">Markup</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((p) => {
                const m = marginPct(p.costCents, p.sellCents);
                const markup = p.costCents > 0 ? Math.round(((p.sellCents - p.costCents) / p.costCents) * 100) : 0;
                return (
                  <TableRow key={p.id}>
                    <TableCell>
                      <div className="font-medium">{p.name}</div>
                      <div className="text-xs text-muted-foreground">{p.sku}</div>
                    </TableCell>
                    <TableCell className="text-right">{formatMoney(p.costCents, store.currency, sym)}</TableCell>
                    <TableCell className="text-right font-semibold">{formatMoney(p.sellCents, store.currency, sym)}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant={m >= 30 ? 'success' : m >= 15 ? 'warning' : 'destructive'}>{m}%</Badge>
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      +{markup}%
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
