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
import { ProductForm } from './product-form';
import { Plus } from 'lucide-react';

export function QuickAddProductDialog({
  storeId,
  isManagerPlus,
}: {
  storeId: string;
  isManagerPlus: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" /> New product
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>New product</DialogTitle>
          <DialogDescription>
            {isManagerPlus
              ? 'Enter product details, cost and sell price. Margin is computed automatically.'
              : 'Fill in the product name, selling price, and current stock count.'}
          </DialogDescription>
        </DialogHeader>
        <ProductForm
          storeId={storeId}
          mode="create"
          isManagerPlus={isManagerPlus}
          onClose={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
