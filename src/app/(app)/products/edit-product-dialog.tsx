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
import { Pencil } from 'lucide-react';

interface ProductData {
  id: string;
  sku: string;
  name: string;
  description: string;
  costCents: number;
  sellCents: number;
  stockQty: number;
  lowStockThreshold: number;
  active: boolean;
}

export function EditProductDialog({
  product,
  storeId,
  isManagerPlus,
}: {
  product: ProductData;
  storeId: string;
  isManagerPlus: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <Pencil className="h-4 w-4" /> Edit
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit · {product.name}</DialogTitle>
          <DialogDescription>
            SKU {product.sku}. Changes are saved instantly to local store and synced when online.
          </DialogDescription>
        </DialogHeader>
        <ProductForm
          storeId={storeId}
          mode="edit"
          isManagerPlus={isManagerPlus}
          initial={{
            id: product.id,
            sku: product.sku,
            name: product.name,
            description: product.description,
            costCents: product.costCents,
            sellCents: product.sellCents,
            stockQty: product.stockQty,
            lowStockThreshold: product.lowStockThreshold,
            active: product.active,
          }}
          onClose={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
