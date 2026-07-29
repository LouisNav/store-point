'use client';
import * as React from 'react';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { v7 as uuidv7 } from 'uuid';
import {
  Search,
  Plus,
  Minus,
  ShoppingCart,
  Trash2,
  User2,
  X,
  CheckCircle2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { cn, formatMoney } from '@/lib/utils';
import { checkout } from './actions';
import { SelectInput } from '@/components/ui/select';

interface ProductLite {
  id: string;
  sku: string;
  name: string;
  description: string;
  sellCents: number;
  stockQty: number;
  lowStockThreshold: number;
  active: 0 | 1;
}

interface CustomerLite {
  id: string;
  name: string;
  phone: string;
}

interface Props {
  storeId: string;
  currency: string;
  currencySymbol?: string;
  products: ProductLite[];
  customers: CustomerLite[];
}

interface CartLine {
  productId: string;
  qty: number;
}

export function PosClient({ storeId, currency, currencySymbol, products, customers }: Props) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customerId, setCustomerId] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'mobile' | 'card' | 'other'>('cash');
  const [discount, setDiscount] = useState<string>('');
  const [busy, setBusy] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products.slice(0, 18);
    return products
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q),
      )
      .slice(0, 18);
  }, [products, query]);

  const cartDetailed = cart.map((line) => {
    const p = products.find((x) => x.id === line.productId)!;
    return {
      ...line,
      name: p.name,
      sku: p.sku,
      unitCents: p.sellCents,
      stockQty: p.stockQty,
      subtotal: line.qty * p.sellCents,
    };
  });
  const subtotal = cartDetailed.reduce((a, l) => a + l.subtotal, 0);
  const discountCents = Math.max(0, Math.round(Number(discount || 0) * 100)) || 0;
  const total = Math.max(0, subtotal - discountCents);

  function add(p: ProductLite) {
    if (!p.active) {
      toast.error(`${p.name} is inactive`);
      return;
    }
    if (p.stockQty <= 0) {
      toast.error(`${p.name} is out of stock`);
      return;
    }
    setCart((c) => {
      const found = c.find((l) => l.productId === p.id);
      if (found) {
        if (found.qty + 1 > p.stockQty) {
          toast.error(`Only ${p.stockQty} in stock for ${p.name}`);
          return c;
        }
        return c.map((l) => (l.productId === p.id ? { ...l, qty: l.qty + 1 } : l));
      }
      return [...c, { productId: p.id, qty: 1 }];
    });
  }
  function inc(productId: string) {
    setCart((c) =>
      c.map((l) => {
        if (l.productId !== productId) return l;
        const p = products.find((x) => x.id === productId)!;
        if (l.qty + 1 > p.stockQty) {
          toast.error(`Only ${p.stockQty} in stock`);
          return l;
        }
        return { ...l, qty: l.qty + 1 };
      }),
    );
  }
  function dec(productId: string) {
    setCart((c) =>
      c
        .map((l) => (l.productId === productId ? { ...l, qty: l.qty - 1 } : l))
        .filter((l) => l.qty > 0),
    );
  }
  function remove(productId: string) {
    setCart((c) => c.filter((l) => l.productId !== productId));
  }
  function clearAll() {
    setCart([]);
    setDiscount('');
    setCustomerId('');
  }

  async function doCheckout() {
    if (cart.length === 0) {
      toast.error('Cart is empty');
      return;
    }
    setBusy(true);
    const fd = new FormData();
    fd.append('paymentMethod', paymentMethod);
    if (customerId) fd.append('customerId', customerId);
    if (discountCents) fd.append('discountCents', String(discountCents));
    fd.append('lines', JSON.stringify(cart));
    // Generate a v7 idempotency key client-side so retries don't double-charge.
    fd.append('idempotencyKey', uuidv7());
    const res = await checkout(null, fd);
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success('Sale recorded');
    router.push(`/sales/${res.saleId}/receipt`);
  }

  const cartInnerUI = (
    <>
      {/* Customer */}
      <div className="rounded-md border bg-muted/30 p-3">
        <div className="mb-1.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <User2 className="h-3.5 w-3.5" /> Walk-in customer?
        </div>
        <SelectInput
          value={customerId || '__walkin__'}
          onValueChange={(v) => setCustomerId(v === '__walkin__' ? '' : v)}
          options={[
            { value: '__walkin__', label: 'Walk-in (no customer)' },
            ...customers.map((c) => ({
              value: c.id,
              label: `${c.name}${c.phone ? ' · ' + c.phone : ''}`,
            })),
          ]}
        />
      </div>

      {/* Lines */}
      <ul className="flex-1 divide-y overflow-y-auto scroll-thin">
        {cartDetailed.length === 0 && (
          <li className="py-8 text-center text-sm text-muted-foreground">
            Tap any product above to add it.
          </li>
        )}
        {cartDetailed.map((l) => (
          <li key={l.productId} className="flex items-center justify-between gap-3 py-2">
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{l.name}</div>
              <div className="text-xs text-muted-foreground">
                {formatMoney(l.unitCents, currency, currencySymbol)} × {l.qty} = {formatMoney(l.subtotal, currency, currencySymbol)}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button size="icon" variant="outline" onClick={() => dec(l.productId)}>
                <Minus className="h-3.5 w-3.5" />
              </Button>
              <span className="w-8 text-center text-sm font-medium">{l.qty}</span>
              <Button size="icon" variant="outline" onClick={() => inc(l.productId)}>
                <Plus className="h-3.5 w-3.5" />
              </Button>
              <Button size="icon" variant="ghost" onClick={() => remove(l.productId)}>
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </Button>
            </div>
          </li>
        ))}
      </ul>

      {/* Totals */}
      <div className="space-y-2 border-t pt-3 text-sm">
        <Row label="Subtotal" value={formatMoney(subtotal, currency, currencySymbol)} />
        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Discount — reduce total by this amount</span>
            <Input
              className="h-8 w-24 text-right"
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
            />
          </div>
          <Row label="Discount" value={`-${formatMoney(discountCents, currency, currencySymbol)}`} />
        </div>

        <div className="pt-1">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Payment</div>
          <SelectInput
            value={paymentMethod}
            onValueChange={(v) => setPaymentMethod(v as typeof paymentMethod)}
            options={[
              { value: 'cash', label: 'Cash' },
              { value: 'mobile', label: 'Mobile money' },
              { value: 'card', label: 'Card' },
              { value: 'other', label: 'Other' },
            ]}
          />
        </div>
        <div className="flex items-center justify-between border-t pt-3 text-lg font-semibold">
          <span>Total</span>
          <span>{formatMoney(total, currency, currencySymbol)}</span>
        </div>
      </div>

      <Button onClick={doCheckout} disabled={busy || cart.length === 0} size="lg" className="w-full">
        <CheckCircle2 className="h-4 w-4" />
        {busy ? 'Saving…' : `Complete sale · ${formatMoney(total, currency, currencySymbol)}`}
      </Button>
    </>
  );

  return (
    <>
      <div className="grid gap-4 pb-24 lg:gap-6 lg:grid-cols-[1fr_22rem] lg:pb-0">
        {/* Product area */}
        <Card>
        <CardHeader className="flex flex-col gap-3 pb-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base">Products</CardTitle>
          <div className="relative w-full sm:max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search…"
              className="pl-9"
              autoFocus
            />
          </div>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">No products match.</p>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {filtered.map((p) => {
                const low = p.stockQty <= p.lowStockThreshold;
                const out = p.stockQty <= 0;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => add(p)}
                    disabled={out}
                    className={cn(
                      'group relative flex flex-col items-start gap-1 rounded-lg border bg-card p-3 text-left transition-all hover:border-primary hover:shadow-md',
                      out && 'cursor-not-allowed opacity-50',
                      low && !out && 'border-amber-300/70',
                    )}
                  >
                    <div className="flex w-full items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold">{p.name}</div>
                        <div className="text-xs text-muted-foreground">SKU · {p.sku}</div>
                      </div>
                      {low && !out && <Badge variant="warning">Low</Badge>}
                      {out && <Badge variant="destructive">Out</Badge>}
                    </div>
                    {p.description && (
                      <p className="line-clamp-2 text-xs text-muted-foreground">{p.description}</p>
                    )}
                    <div className="mt-1 flex w-full items-end justify-between">
                      <span className="text-base font-bold">{formatMoney(p.sellCents, currency, currencySymbol)}</span>
                      <Badge variant="muted" className="text-[10px]">Qty: {p.stockQty}</Badge>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Desktop Cart (hidden on mobile) */}
      <Card className="hidden flex-col lg:flex">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShoppingCart className="h-4 w-4" /> Cart ({cart.length})
          </CardTitle>
          {cart.length > 0 && (
            <Button variant="ghost" size="sm" onClick={clearAll}>
              <X className="h-4 w-4" /> Clear
            </Button>
          )}
        </CardHeader>
        <CardContent className="flex flex-1 flex-col gap-3">
          {cartInnerUI}
        </CardContent>
      </Card>
      </div>

      {/* Mobile cart button + bottom sheet (hidden on desktop) */}
      <div className="fixed bottom-0 left-0 right-0 z-40 border-t bg-background p-3 lg:hidden">
        <Dialog>
          <DialogTrigger asChild>
            <Button size="lg" className="w-full shadow-lg">
              <ShoppingCart className="h-4 w-4" />
              Cart ({cart.length}){cart.length > 0 && <> · {formatMoney(total, currency, currencySymbol)}</>}
            </Button>
          </DialogTrigger>
          <DialogContent className="bottom-0 left-0 right-0 top-auto max-h-[88vh] max-w-full translate-x-0 translate-y-0 gap-0 overflow-y-auto rounded-b-none rounded-t-xl p-4">
            <DialogHeader className="mb-3">
              <DialogTitle className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <ShoppingCart className="h-5 w-5" /> Cart ({cart.length})
                </span>
                {cart.length > 0 && (
                  <Button variant="ghost" size="sm" onClick={clearAll}>
                    <X className="h-4 w-4" /> Clear
                  </Button>
                )}
              </DialogTitle>
            </DialogHeader>
            <div className="flex flex-1 flex-col gap-3">
              {cartInnerUI}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
