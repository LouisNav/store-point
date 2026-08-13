import { requireActiveStore, can } from '@/lib/auth/guards';
import { Permission } from '@/lib/rbac';
import { productsRepo } from '@/lib/db/repositories/products.repo';
import { storesRepo } from '@/lib/db/repositories/stores.repo';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Boxes, History } from 'lucide-react';
import { formatMoney, marginPct, getCurrencySymbol } from '@/lib/utils';
import { QuickAddProductDialog } from './quick-add-dialog';
import { EditProductDialog } from './edit-product-dialog';
import { StockAdjustDialog } from './stock-adjust-dialog';

export default async function ProductsPage() {
  const { storeId, role } = await requireActiveStore();
  const store = storesRepo.byId(storeId)!;
  const products = productsRepo.list(storeId);
  const sym = getCurrencySymbol(store.brandJson);
  const canSeeCost = can(role, Permission.ProductsReadCost);
  const canEdit = can(role, Permission.ProductsWrite);
  const canAdjust = can(role, Permission.StockAdjust);
  const recentInventoryAudit = canAdjust ? productsRepo.inventoryAudit(storeId, undefined, 8) : [];

  return (
    <div>
      <PageHeader
        title="Products"
        description={
          canSeeCost
            ? 'Cost, sell price and margin are visible to you. Click any product to edit.'
            : 'Browse products, selling prices and stock levels.'
        }
        actions={
          canEdit ? (
            <QuickAddProductDialog storeId={storeId} isManagerPlus={canSeeCost} />
          ) : undefined
        }
      />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{products.length} product{products.length === 1 ? '' : 's'}</CardTitle>
          <CardDescription>Active products appear first.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {products.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={<Boxes className="h-6 w-6" />}
                title="No products yet"
                description={canEdit ? 'Get started by adding your first product.' : 'When products are added by a manager they will appear here.'}
                action={
                  canEdit ? (
                    <QuickAddProductDialog storeId={storeId} isManagerPlus={canSeeCost} />
                  ) : undefined
                }
              />
            </div>
          ) : (
            <Table className="min-w-[640px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  {canSeeCost && <TableHead className="hidden text-right sm:table-cell">Cost</TableHead>}
                  <TableHead className="text-right">Price</TableHead>
                  {canSeeCost && <TableHead className="hidden text-right sm:table-cell">Margin</TableHead>}
                  <TableHead className="text-center">Stock</TableHead>
                  <TableHead>Status</TableHead>
                  {(canEdit || canAdjust) && <TableHead className="text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((p) => {
                  const low = p.stockQty <= p.lowStockThreshold;
                  const out = p.stockQty <= 0;
                  return (
                    <TableRow key={p.id}>
                      <TableCell>
                        <div className="font-medium">{p.name}</div>
                        <div className="text-xs text-muted-foreground">SKU · {p.sku}</div>
                      </TableCell>
                      {canSeeCost && (
                        <TableCell className="hidden text-right tabular-nums sm:table-cell">{formatMoney(p.costCents, store.currency, sym)}</TableCell>
                      )}
                      <TableCell className="text-right font-semibold tabular-nums">{formatMoney(p.sellCents, store.currency, sym)}</TableCell>
                      {canSeeCost && (
                        <TableCell className="hidden text-right tabular-nums sm:table-cell">
                          <span className={marginPct(p.costCents, p.sellCents) >= 30 ? 'text-success' : marginPct(p.costCents, p.sellCents) >= 15 ? 'text-amber-600' : 'text-destructive'}>
                            {marginPct(p.costCents, p.sellCents)}%
                          </span>
                        </TableCell>
                      )}
                      <TableCell className="text-center">
                        <Badge variant={out ? 'destructive' : low ? 'warning' : 'secondary'}>
                          {p.stockQty}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={p.active ? 'success' : 'muted'}>
                          {p.active ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      {(canEdit || canAdjust) && (
                        <TableCell className="text-right">
                          <div className="flex flex-wrap justify-end gap-2">
                            {canAdjust && <StockAdjustDialog storeId={storeId} productId={p.id} productName={p.name} currentQty={p.stockQty} />}
                            {canEdit && <EditProductDialog
                              product={{
                                id: p.id,
                                sku: p.sku,
                                name: p.name,
                                description: p.description,
                                costCents: p.costCents,
                                sellCents: p.sellCents,
                                stockQty: p.stockQty,
                                lowStockThreshold: p.lowStockThreshold,
                                active: p.active === 1,
                              }}
                              storeId={storeId}
                              isManagerPlus={canSeeCost}
                            />}
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {canAdjust && recentInventoryAudit.length > 0 && (
        <Card className="mt-4">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base"><History className="h-4 w-4 text-primary" /> Recent stock adjustments</CardTitle>
            <CardDescription>Immutable movement history for this store.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {recentInventoryAudit.map((entry) => {
                const product = products.find((item) => item.id === entry.productId);
                return <div key={entry.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm"><div className="min-w-0"><div className="font-medium">{product?.name ?? 'Former product'}</div><div className="truncate text-xs text-muted-foreground">{entry.reason} · {new Date(entry.createdAt).toLocaleString()}</div></div><Badge variant={entry.delta > 0 ? 'success' : 'warning'}>{entry.delta > 0 ? '+' : ''}{entry.delta} · {entry.afterQty} total</Badge></div>;
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
