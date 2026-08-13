'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowDownToLine, ArrowUpFromLine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { FormLabel } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { adjustStock } from './actions';

export function StockAdjustDialog({
  storeId,
  productId,
  productName,
  currentQty,
}: {
  storeId: string;
  productId: string;
  productName: string;
  currentQty: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = Number(delta);
    if (!Number.isInteger(value) || value === 0) {
      toast.error('Enter a non-zero whole-unit adjustment.');
      return;
    }
    if (reason.trim().length < 3) {
      toast.error('Add a reason for the stock adjustment.');
      return;
    }
    setSaving(true);
    const result = await adjustStock(storeId, productId, value, reason);
    setSaving(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success(`${productName} stock adjusted`);
    setDelta('');
    setReason('');
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <ArrowUpFromLine className="h-3.5 w-3.5" /> Adjust stock
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Adjust · {productName}</DialogTitle>
          <DialogDescription>
            Current quantity: <strong>{currentQty}</strong>. Every movement is recorded in the inventory audit trail.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4">
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <FormLabel required hint="Positive adds stock; negative removes stock">Quantity change</FormLabel>
              <Input autoFocus type="number" step="1" placeholder="e.g. 12 or -2" value={delta} onChange={(event) => setDelta(event.target.value)} />
            </div>
            <div className="flex items-end gap-2 pb-0.5">
              <Button type="button" variant="outline" size="sm" onClick={() => setDelta('1')} aria-label="Add one unit"><ArrowUpFromLine className="mr-1 h-3.5 w-3.5" /> +1</Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setDelta('-1')} aria-label="Remove one unit"><ArrowDownToLine className="mr-1 h-3.5 w-3.5" /> −1</Button>
            </div>
          </div>
          <div>
            <FormLabel required hint="Examples: received shipment, damaged, count correction, returned to vendor">Reason</FormLabel>
            <Textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={240} placeholder="Why is the quantity changing?" className="min-h-[5rem] resize-none" />
            <div className="mt-1 text-right text-[11px] text-muted-foreground">{reason.length}/240</div>
          </div>
          <div className="flex justify-end gap-2 border-t pt-4">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Recording…' : 'Record adjustment'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
