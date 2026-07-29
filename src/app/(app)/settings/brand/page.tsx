import { redirect } from 'next/navigation';
import { requireActiveStore, can } from '@/lib/auth/guards';
import { Permission } from '@/lib/rbac';
import { storesRepo, parseBrand } from '@/lib/db/repositories/stores.repo';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { BrandForm } from './brand-form';

export default async function BrandPage() {
  const { storeId, role } = await requireActiveStore();
  if (!can(role, Permission.StoreBrand)) redirect('/dashboard');
  const store = storesRepo.byId(storeId)!;
  const brand = parseBrand(store.brandJson);

  return (
    <div>
      <PageHeader
        title="Store branding"
        description="Customize how this store appears to staff and on receipts."
      />

      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle className="text-base">Brand</CardTitle>
          <CardDescription>Changes apply instantly — even on the printed receipt.</CardDescription>
        </CardHeader>
        <CardContent>
          <BrandForm
            storeId={store.id}
            initial={{
              storeName: store.name,
              currency: store.currency,
              tagline: brand.tagline ?? '',
              accent: brand.accent ?? '#0ea5e9',
              logoDataUrl: brand.logoDataUrl ?? '',
              currencySymbol: brand.currencySymbol ?? '',
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
