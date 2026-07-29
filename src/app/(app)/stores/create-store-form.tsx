'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { FormLabel } from '@/components/ui/label';
import { createStore } from './actions';

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  slug: z
    .string()
    .min(2, 'Min 2 chars')
    .max(40)
    .regex(/^[a-z0-9-]+$/, 'Lowercase letters, digits, hyphens only'),
  currency: z.string().min(1).max(8).default('USD'),
});
type Values = z.infer<typeof schema>;

export function CreateStoreForm({ onClose }: { onClose?: () => void }) {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { currency: 'USD' } });

  async function onSubmit(v: Values) {
    const fd = new FormData();
    Object.entries(v).forEach(([k, val]) => fd.append(k, String(val)));
    const result = await createStore(null, fd);
    if (result?.error) {
      setError('name', { message: result.error });
      toast.error(result.error);
      return;
    }
    toast.success('Store created');
    router.refresh();
    onClose?.();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <FormLabel required hint="Display name for this shop — appears across the app">Store name</FormLabel>
        <Input placeholder="Greenmarket Apapa" {...register('name')} />
        {errors.name && <p className="mt-1 text-xs text-destructive">{errors.name.message}</p>}
      </div>
      <div>
        <FormLabel required hint="Used in the web address — lowercase, no spaces. Cannot be changed later." >
          Slug
        </FormLabel>
        <Input placeholder="greenmarket-apapa" {...register('slug')} />
        {errors.slug && <p className="mt-1 text-xs text-destructive">{errors.slug.message}</p>}
      </div>
      <div>
        <FormLabel hint="3-letter currency code — USD, NGN, KES, GHS, ZAR, etc.">Currency</FormLabel>
        <Input {...register('currency')} />
        {errors.currency && <p className="mt-1 text-xs text-destructive">{errors.currency.message}</p>}
      </div>
      <Button type="submit" disabled={isSubmitting} className="w-full">
        {isSubmitting ? 'Creating…' : 'Create store'}
      </Button>
    </form>
  );
}
