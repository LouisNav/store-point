'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { FormLabel } from '@/components/ui/label';
import { createProduct, updateProduct, deleteProduct } from './actions';

const schema = z.object({
  sku: z.string().min(1).max(40),
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional().default(''),
  costCents: z.coerce.number().int().nonnegative().default(0),
  sellCents: z.coerce.number().int().nonnegative(),
  stockQty: z.coerce.number().int().nonnegative(),
  lowStockThreshold: z.coerce.number().int().nonnegative().default(5),
  active: z.boolean().default(true),
});
type Values = z.infer<typeof schema>;

interface Initial {
  id?: string;
  sku: string;
  name: string;
  description: string;
  costCents: number;
  sellCents: number;
  stockQty: number;
  lowStockThreshold: number;
  active: boolean;
}

export function ProductForm({
  storeId,
  mode,
  initial,
  isManagerPlus,
  onClose,
}: {
  storeId: string;
  mode: 'create' | 'edit';
  initial?: Initial;
  isManagerPlus: boolean;
  onClose?: () => void;
}) {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    setError,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: initial ?? {
      sku: '',
      name: '',
      description: '',
      costCents: 0,
      sellCents: 0,
      stockQty: 0,
      lowStockThreshold: 5,
      active: true,
    },
  });
  const cost = Number(watch('costCents') || 0);
  const sell = Number(watch('sellCents') || 0);
  const margin = cost > 0 ? Math.round(((sell - cost) / cost) * 1000) / 10 : 0;

  async function onSubmit(v: Values) {
    const fd = new FormData();
    Object.entries(v).forEach(([k, val]) => fd.append(k, String(val)));
    if (mode === 'edit' && initial?.id) fd.append('id', initial.id);
    const result = mode === 'edit' ? await updateProduct(storeId, fd) : await createProduct(storeId, fd);
    if ((result as { error?: string })?.error) {
      setError('name', { message: (result as { error: string }).error });
      toast.error((result as { error: string }).error);
      return;
    }
    toast.success(mode === 'edit' ? 'Product updated' : 'Product created');
    if (mode === 'create' && onClose) {
      router.refresh();
      onClose();
    } else {
      router.push('/products');
      router.refresh();
      onClose?.();
    }
  }

  async function onDelete() {
    if (!initial?.id) return;
    if (!confirm('Remove this product? It will no longer appear in the cash register but stays in your records.')) return;
    const fd = new FormData();
    fd.append('id', initial.id);
    const result = await deleteProduct(storeId, fd);
    if ((result as { error?: string })?.error) {
      toast.error((result as { error: string }).error);
      return;
    }
    toast.success('Product removed');
    router.push('/products');
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="grid gap-5 sm:grid-cols-2">
      <div className="sm:col-span-2 grid gap-4 sm:grid-cols-2">
        <div>
          <FormLabel required hint="Stock keeping unit — a short code like RICE-5KG">SKU</FormLabel>
          <Input placeholder="e.g. RICE-5KG" {...register('sku')} />
          {errors.sku && <p className="mt-1 text-xs text-destructive">{errors.sku.message}</p>}
        </div>
        <div>
          <FormLabel required hint="Shown at the till, on receipts, and in search">Name</FormLabel>
          <Input placeholder="e.g. Rice 5kg bag" {...register('name')} />
          {errors.name && <p className="mt-1 text-xs text-destructive">{errors.name.message}</p>}
        </div>
      </div>

      <div className="sm:col-span-2">
        <FormLabel hint="Brand, size, weight — helps staff identify the product">Description</FormLabel>
        <Textarea rows={3} placeholder="Brand, size, etc." {...register('description')} />
      </div>

      <div className={isManagerPlus ? '' : 'sm:col-span-2'}>
        <FormLabel required hint="What customers pay for one unit (including tax if applicable)">Sell price</FormLabel>
        <Input
          type="number"
          step="0.01"
          min="0"
          {...register('sellCents', { setValueAs: (v) => Math.round(Number(v) * 100) })}
        />
        {errors.sellCents && <p className="mt-1 text-xs text-destructive">{errors.sellCents.message}</p>}
      </div>
      {isManagerPlus && (
        <div>
          <FormLabel hint="The amount you paid to acquire one unit">Cost price</FormLabel>
          <Input
            type="number"
            step="0.01"
            min="0"
            {...register('costCents', { setValueAs: (v) => Math.round(Number(v || 0) * 100) })}
          />
        </div>
      )}

      <div>
        <FormLabel required hint="Units currently on the shelf">Stock quantity</FormLabel>
        <Input type="number" step="1" min="0" {...register('stockQty')} />
      </div>
      <div>
        <FormLabel hint="Get alerted on the dashboard when stock drops to or below this">Low-stock alert</FormLabel>
        <Input type="number" step="1" min="0" {...register('lowStockThreshold')} />
      </div>

      <div className="sm:col-span-2 flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4 rounded" {...register('active')} />
          <span>Active and visible in the cash register</span>
        </label>
        {isManagerPlus && (
          <span className="text-xs text-muted-foreground">Current margin: <strong className={margin > 30 ? 'text-success' : margin > 0 ? 'text-amber-600' : 'text-destructive'}>{margin}%</strong></span>
        )}
      </div>

      <div className="sm:col-span-2 flex items-center justify-between gap-3 border-t pt-4">
        {mode === 'edit' && isManagerPlus ? (
          <Button type="button" variant="ghost" className="text-destructive" onClick={onDelete}>
            Delete
          </Button>
        ) : <span />}
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={() => onClose ? onClose() : router.push('/products')}>Cancel</Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Saving…' : mode === 'edit' ? 'Save changes' : 'Create product'}
          </Button>
        </div>
      </div>
    </form>
  );
}
