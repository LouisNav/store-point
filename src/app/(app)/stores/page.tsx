import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth/guards';
import { storesRepo, parseBrand } from '@/lib/db/repositories/stores.repo';
import { membershipsRepo } from '@/lib/db/repositories/memberships.repo';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Store } from 'lucide-react';
import { AddStoreDialog } from './add-store-dialog';
import { SwitchStoreButton } from './switch-store-button';

export default async function StoresPage() {
  const session = await requireUser();

  const memberships = membershipsRepo.forUser(session.userId!);
  const isRoot = session.isRoot === true;

  // Single-store non-root users have nothing to switch — redirect to dashboard.
  if (!isRoot && memberships.length === 1) redirect('/dashboard');

  const visible = isRoot ? storesRepo.list() : memberships.map((m) => storesRepo.byId(m.storeId)).filter(Boolean);

  return (
    <div>
      <PageHeader
        title="Your stores"
        description={
          isRoot
            ? 'As the root admin you can see and switch to every store on this server.'
            : 'Pick a store to start working. Your role in each store is shown below.'
        }
        actions={isRoot ? <AddStoreDialog /> : undefined}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {visible.length === 0 && (
          <Card className="sm:col-span-2 lg:col-span-3">
            <CardContent className="py-10 text-center text-muted-foreground">
              You don't have any stores yet. {isRoot ? 'Click "New store" above to create one.' : 'Ask your manager to invite you.'}
            </CardContent>
          </Card>
        )}
        {visible.map((s) => {
          if (!s) return null;
          const active = s.id === session.activeStoreId;
          const m = memberships.find((mm) => mm.storeId === s.id);
          const brand = parseBrand(s.brandJson);
          return (
            <Card key={s.id} className={active ? 'border-primary shadow-md' : ''}>
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/15 text-primary">
                      <Store className="h-5 w-5" />
                    </div>
                    <div>
                      <CardTitle className="text-base">{s.name}</CardTitle>
                      <CardDescription>{s.currency}</CardDescription>
                    </div>
                  </div>
                  {active && <Badge variant="success">Active</Badge>}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {brand.tagline && <p className="text-sm italic text-muted-foreground">{brand.tagline}</p>}
                <div className="text-sm">
                  Your role: <span className="font-medium">{m?.role ?? 'No membership'}</span>
                </div>
                {!active && <SwitchStoreButton storeId={s.id} />}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
