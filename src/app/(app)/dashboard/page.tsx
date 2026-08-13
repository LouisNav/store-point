import Link from 'next/link';
import { requireActiveStore } from '@/lib/auth/guards';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { can, Permission, canSeeProfit, ROLE_LABEL } from '@/lib/rbac';
import { productsRepo } from '@/lib/db/repositories/products.repo';
import { salesRepo } from '@/lib/db/repositories/sales.repo';
import { storesRepo } from '@/lib/db/repositories/stores.repo';
import { formatMoney, getCurrencySymbol } from '@/lib/utils';
import { RoleAnnouncementBanner } from '@/components/RoleAnnouncementBanner';
import {
  Boxes,
  ScanLine,
  ShoppingCart,
  TrendingUp,
  Wallet,
  AlertTriangle,
  Calculator,
} from 'lucide-react';

export default async function DashboardPage() {
  const { storeId, role, session } = await requireActiveStore();

  const products = productsRepo.list(storeId);
  const activeProductCount = products.filter((product) => product.active === 1).length;
  const lowStock = productsRepo.lowStock(storeId);
  const recentSales = salesRepo.list(storeId, 5);
  const summary = salesRepo.dailySummary(storeId, new Date());
  const profit = salesRepo.todaysProfit(storeId);

  const fullName = session.name ?? 'there';
  const storeObj = storesRepo.byId(storeId);
  const activeStoreName =
    storeObj?.name ??
    session.memberships?.find((m) => m.storeId === storeId)?.storeName ??
    'your store';
  const sym = getCurrencySymbol(storeObj?.brandJson);

  return (
    <div>
      <RoleAnnouncementBanner
        role={role}
        storeName={activeStoreName}
        userName={fullName === 'there' ? 'team member' : fullName}
      />
      <PageHeader
        title={`Hello, ${fullName}`}
        description={
          <span>
            You're signed in as <Badge variant="secondary">{ROLE_LABEL[role]}</Badge> in{' '}
            <strong>{activeStoreName}</strong>.
          </span>
        }
        actions={
          can(role, Permission.SalesCreate) ? (
            <Button asChild={false}>
              <Link href="/pos" className="flex items-center gap-2">
                <ScanLine className="h-4 w-4" /> Open Cash Register
              </Link>
            </Button>
          ) : undefined
        }
      />

      {/* Metric cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          title="Today's sales"
          value={formatMoney(summary.totalCents, storeObj?.currency, sym)}
          subtitle={`${summary.count} transaction${summary.count === 1 ? '' : 's'}`}
          icon={<ShoppingCart className="h-5 w-5" />}
        />
        <Metric
          title="Items sold today"
          value={String(summary.itemsCount)}
          subtitle={`${summary.refundsCount} refund${summary.refundsCount === 1 ? '' : 's'}`}
          icon={<Boxes className="h-5 w-5" />}
        />
        {canSeeProfit(role) ? (
          <Metric
            title="Today's profit"
            value={formatMoney(profit.profitCents, storeObj?.currency, sym)}
            subtitle={`on ${formatMoney(profit.revenueCents, storeObj?.currency, sym)} revenue`}
            tone="success"
            icon={<TrendingUp className="h-5 w-5" />}
          />
        ) : (
          <Metric
            title="Active products"
            value={String(activeProductCount)}
            subtitle="in your store"
            icon={<Boxes className="h-5 w-5" />}
          />
        )}
        {canSeeProfit(role) ? (
          <Metric
            title="Today's margin"
            value={
              profit.revenueCents > 0
                ? `${Math.round((profit.profitCents / profit.revenueCents) * 100)}%`
                : '—'
            }
            subtitle="profit / revenue"
            tone="primary"
            icon={<Wallet className="h-5 w-5" />}
          />
        ) : (
          <Metric
            title="Low stock"
            value={String(lowStock.length)}
            subtitle={lowStock.length > 0 ? 'needs restock' : 'all good 👍'}
            tone={lowStock.length > 0 ? 'warning' : 'success'}
            icon={<AlertTriangle className="h-5 w-5" />}
          />
        )}
      </div>

      {/* Shortcuts */}
      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Recent sales</CardTitle>
            <CardDescription>Your latest five transactions</CardDescription>
          </CardHeader>
          <CardContent>
            {recentSales.length === 0 ? (
              <EmptyState
                icon={<ShoppingCart className="h-6 w-6" />}
                title="No sales yet today"
                description={can(role, Permission.SalesCreate) ? 'Head to the cash register to record your first sale.' : 'Once sales agents process transactions, they appear here.'}
                action={
                  can(role, Permission.SalesCreate) ? (
                    <Button asChild>
                      <Link href="/pos">Open Cash Register</Link>
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <ul className="divide-y">
                {recentSales.map((s) => (
                  <li key={s.id} className="flex items-center justify-between py-3">
                    <div>
                      <div className="text-sm font-medium">{s.receiptNumber}</div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(s.createdAt).toLocaleString()} · {s.paymentMethod}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {s.status !== 'completed' && (
                        <Badge variant={s.status === 'refunded' ? 'destructive' : 'warning'}>
                          {s.status.replace('_', ' ')}
                        </Badge>
                      )}
                      <span className="font-semibold">{formatMoney(s.totalCents, storeObj?.currency, sym)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Shortcuts</CardTitle>
            <CardDescription>Common tasks</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            <Shortcut href="/pos" icon={<ScanLine className="h-4 w-4" />} label="Cash Register" allowed={can(role, Permission.SalesCreate)} />
            <Shortcut href="/products" icon={<Boxes className="h-4 w-4" />} label="Manage products" allowed />
            <Shortcut href="/customers" icon={<ShoppingCart className="h-4 w-4" />} label="Customers" allowed />
            <Shortcut href="/sales" icon={<ShoppingCart className="h-4 w-4" />} label="Sales history" allowed />
            {can(role, Permission.ReportsCashup) && (
              <Shortcut href="/reports/cashup" icon={<Calculator className="h-4 w-4" />} label="Daily cash-up" allowed />
            )}
            {can(role, Permission.UsersManage) && (
              <Shortcut href="/users" icon={<ShoppingCart className="h-4 w-4" />} label="Staff & roles" allowed />
            )}
            {can(role, Permission.StoreBrand) && (
              <Shortcut href="/settings/brand" icon={<Wallet className="h-4 w-4" />} label="Brand & theme" allowed />
            )}
          </CardContent>
        </Card>

        {lowStock.length > 0 && (
          <Card className="lg:col-span-3 border-amber-300/60 bg-amber-50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-amber-800">
                <AlertTriangle className="h-5 w-5" />
                Low-stock alerts ({lowStock.length})
              </CardTitle>
              <CardDescription>Reorder these as soon as possible.</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {lowStock.map((p) => (
                  <li key={p.id} className="flex items-center justify-between rounded-md bg-white/70 px-3 py-2 ring-1 ring-amber-200">
                    <div>
                      <div className="text-sm font-medium">{p.name}</div>
                      <div className="text-xs text-muted-foreground">SKU {p.sku}</div>
                    </div>
                    <Badge variant="warning">Qty: {p.stockQty}</Badge>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function Metric({
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
  tone?: 'default' | 'success' | 'warning' | 'primary';
}) {
  const ring = {
    default: 'bg-muted text-foreground',
    success: 'bg-success/15 text-success',
    warning: 'bg-amber-100 text-amber-700',
    primary: 'bg-primary/15 text-primary',
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

function Shortcut({
  href,
  label,
  icon,
  allowed,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
  allowed: boolean;
}) {
  if (!allowed) return null;
  return (
    <Link
      href={href}
      className="flex items-center justify-between rounded-md border bg-card px-3 py-2 text-sm font-medium transition-colors hover:bg-muted"
    >
      <div className="flex items-center gap-2">
        {icon} {label}
      </div>
      <span className="text-muted-foreground">→</span>
    </Link>
  );
}
