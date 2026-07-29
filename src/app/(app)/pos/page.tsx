import { redirect } from 'next/navigation';
import { requireActiveStore, can } from '@/lib/auth/guards';
import { Permission } from '@/lib/rbac';
import { productsRepo } from '@/lib/db/repositories/products.repo';
import { customersRepo } from '@/lib/db/repositories/customers.repo';
import { storesRepo } from '@/lib/db/repositories/stores.repo';
import { getCurrencySymbol } from '@/lib/utils';
import { PageHeader } from '@/components/ui/page-header';
import { PosClient } from './pos-client';

export default async function PosPage() {
  const { storeId, role } = await requireActiveStore();

  if (!can(role, Permission.SalesCreate)) {
    redirect('/dashboard');
  }

  const store = storesRepo.byId(storeId)!;
  const products = productsRepo.list(storeId);
  const customers = customersRepo.list(storeId);
  const sym = getCurrencySymbol(store.brandJson);

  return (
    <div>
      <PageHeader
        title="Cash Register"
        description="Search products, build the cart, then complete the sale."
      />
      <PosClient
        storeId={storeId}
        currency={store.currency}
        currencySymbol={sym}
        products={products.map((p) => ({
          id: p.id,
          sku: p.sku,
          name: p.name,
          description: p.description,
          sellCents: p.sellCents,
          stockQty: p.stockQty,
          lowStockThreshold: p.lowStockThreshold,
          active: p.active,
        }))}
        customers={customers.map((c) => ({
          id: c.id,
          name: c.name,
          phone: c.phone,
        }))}
      />
    </div>
  );
}
