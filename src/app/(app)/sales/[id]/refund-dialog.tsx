'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Undo2 } from 'lucide-react';
import { RefundForm } from './refund-form';

interface RefundItem {
  id: string;
  label: string;
  maxQty: number;
  refundCentsPerUnit: number;
}

export function RefundDialog({
  saleId,
  currency,
  currencySymbol,
  items,
}: {
  saleId: string;
  currency: string;
  currencySymbol?: string;
  items: RefundItem[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="destructive" size="sm">
          <Undo2 className="h-4 w-4" /> Refund
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Undo2 className="h-4 w-4" /> Process a refund
          </DialogTitle>
          <DialogDescription>
            Select which items to refund and add a reason. Refund total is shown before you confirm.
          </DialogDescription>
        </DialogHeader>
        <RefundForm
          saleId={saleId}
          currency={currency}
          currencySymbol={currencySymbol}
          items={items}
          onClose={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
