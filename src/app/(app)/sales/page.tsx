import Link from 'next/link';
import { requireActiveStore, can } from '@/lib/auth/guards';
import { Permission } from '@/lib/rbac';
import { salesRepo } from '@/lib/db/repositories/sales.repo';
import { productsRepo } from '@/lib/db/repositories/products.repo';
import { storesRepo } from '@/lib/db/repositories/stores.repo';
import { customersRepo } from '@/lib/db/repositories/customers.repo';
import { usersRepo } from '@/lib/db/repositories/users.repo';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { ShoppingCart } from 'lucide-react';
import { formatMoney, getCurrencySymbol } from '@/lib/utils';

export default async function SalesListPage() {
  const { storeId } = await requireActiveStore();
  const store = storesRepo.byId(storeId)!;
  const sym = getCurrencySymbol(store.brandJson);
  const sales = salesRepo.list(storeId, 100);

  // Pre-build lookup tables.
  const products = productsRepo.list(storeId);
  const customers = customersRepo.list(storeId);
  const users = usersRepo.list();

  return (
    <div>
      <PageHeader
        title="Sales history"
        description="Browse and refund transactions."
      />

      <Card>
        <CardContent className="p-0">
          {sales.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={<ShoppingCart className="h-6 w-6" />}
                title="No sales recorded yet"
                description="Transactions you record at the cash register will appear here."
              />
            </div>
          ) : (
            <Table className="min-w-[640px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Receipt</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead className="hidden sm:table-cell">Customer</TableHead>
                  <TableHead className="hidden sm:table-cell">Cashier</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sales.map((s) => {
                  const items = salesRepo.items(s.id);
                  const cust = s.customerId ? customers.find((c) => c.id === s.customerId) : null;
                  const cashier = users.find((u) => u.id === s.cashierId);
                  return (
                    <TableRow key={s.id} className="cursor-pointer">
                      <TableCell>
                        <Link className="font-medium hover:underline" href={`/sales/${s.id}`}>
                          {s.receiptNumber}
                        </Link>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {new Date(s.createdAt).toLocaleString()}
                      </TableCell>
                      <TableCell>{items.length}</TableCell>
                      <TableCell className="hidden sm:table-cell">{cust?.name ?? <span className="text-muted-foreground">—</span>}</TableCell>
                      <TableCell className="hidden sm:table-cell">{cashier?.name ?? <span className="text-muted-foreground">—</span>}</TableCell>
                      <TableCell className="capitalize">{s.paymentMethod}</TableCell>
                      <TableCell className="text-right font-semibold">{formatMoney(s.totalCents, store.currency, sym)}</TableCell>
                      <TableCell className="text-right">
                        <Badge
                          variant={s.status === 'completed' ? 'secondary' : s.status === 'refunded' ? 'destructive' : 'warning'}
                        >
                          {s.status.replace('_', ' ')}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
