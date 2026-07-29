'use client';
import * as React from 'react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { v7 as uuidv7 } from 'uuid';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { formatMoney } from '@/lib/utils';
import { refundSale } from './actions';

interface Item {
  id: string;
  label: string;
  maxQty: number;
  refundCentsPerUnit: number;
}

export function RefundForm({
  saleId,
  currency,
  currencySymbol,
  items,
  onClose,
}: {
  saleId: string;
  currency: string;
  currencySymbol?: string;
  items: Item[];
  onClose?: () => void;
}) {
  const router = useRouter();
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const refundLines = items
    .map((it) => ({ saleItemId: it.id, qty: quantities[it.id] ?? 0 }))
    .filter((l) => l.qty > 0);
  const totalCents = refundLines.reduce((a, l) => {
    const it = items.find((x) => x.id === l.saleItemId)!;
    return a + l.qty * it.refundCentsPerUnit;
  }, 0);

  async function submit() {
    if (refundLines.length === 0) {
      toast.error('Pick at least one item to refund');
      return;
    }
    setBusy(true);
    const fd = new FormData();
    fd.append('saleId', saleId);
    fd.append('reason', reason);
    fd.append('lines', JSON.stringify(refundLines));
    // Idempotency key so retries don't double-refund.
    fd.append('idempotencyKey', uuidv7());
    const res = await refundSale(null, fd);
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success('Refund processed');
    router.refresh();
    onClose?.();
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {items.map((it) => (
          <div
            key={it.id}
            className="flex items-center justify-between gap-3 rounded-md border bg-muted/30 px-3 py-2 text-sm"
          >
            <div className="min-w-0">
              <div className="truncate font-medium">{it.label}</div>
              <div className="text-xs text-muted-foreground">
                {formatMoney(it.refundCentsPerUnit, currency, currencySymbol)} ea
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <Input
                type="number"
                min="0"
                max={it.maxQty}
                step="1"
                className="h-8 w-16 text-right"
                value={quantities[it.id] ?? ''}
                onChange={(e) =>
                  setQuantities((q) => ({
                    ...q,
                    [it.id]: Math.max(
                      0,
                      Math.min(it.maxQty, parseInt(e.target.value || '0', 10)),
                    ),
                  }))
                }
                placeholder="0"
              />
              <span className="text-xs text-muted-foreground">/{it.maxQty}</span>
            </div>
          </div>
        ))}
      </div>
      <div>
        <Label>Reason (optional)</Label>
        <Textarea
          rows={2}
          value={reason}
          placeholder="e.g. customer changed mind, defective item…"
          onChange={(e) => setReason(e.target.value)}
        />
      </div>
      <div className="flex items-center justify-between border-t pt-3 text-sm">
        <span className="text-muted-foreground">Refund total</span>
        <span className="text-base font-semibold">{formatMoney(totalCents, currency, currencySymbol)}</span>
      </div>
      <Button
        onClick={submit}
        disabled={busy || refundLines.length === 0}
        className="w-full"
        variant="destructive"
      >
        {busy
          ? 'Processing…'
          : refundLines.length === 0
            ? 'Pick items to refund'
            : 'Process refund'}
      </Button>
    </div>
  );
}
