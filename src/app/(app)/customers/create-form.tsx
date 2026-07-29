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
import { createCustomer } from './actions';

const schema = z.object({
  name: z.string().min(1, 'Name required'),
  phone: z.string().max(40).optional().default(''),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  notes: z.string().max(500).optional().default(''),
});
type V = z.infer<typeof schema>;

export function CustomerCreateForm({ onClose }: { onClose?: () => void }) {
  const router = useRouter();
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<V>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', phone: '', email: '', notes: '' },
  });

  async function onSubmit(v: V) {
    const r = await createCustomer({
      name: v.name,
      phone: v.phone ?? '',
      email: v.email ?? '',
      notes: v.notes ?? '',
    });
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    toast.success(`Customer "${v.name}" added`);
    reset();
    router.refresh();
    onClose?.();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
      <div>
        <FormLabel required hint="Customer's full name as it will appear on receipts">Name</FormLabel>
        <Input placeholder="Full name" {...register('name')} />
        {errors.name && <p className="mt-1 text-xs text-destructive">{errors.name.message}</p>}
      </div>
      <div>
        <FormLabel hint="For sending SMS receipts and contact">Phone</FormLabel>
        <Input placeholder="+234…" {...register('phone')} />
      </div>
      <div>
        <FormLabel hint="Optional — for sending email receipts">Email</FormLabel>
        <Input type="email" placeholder="customer@example.com" {...register('email')} />
        {errors.email && <p className="mt-1 text-xs text-destructive">{errors.email.message}</p>}
      </div>
      <div>
        <FormLabel hint="Preferences, delivery address, anything worth remembering">Notes</FormLabel>
        <Textarea rows={2} placeholder="Preferences, allergies… (optional)" {...register('notes')} />
      </div>
      <Button type="submit" disabled={isSubmitting} className="w-full">
        {isSubmitting ? 'Saving…' : 'Add customer'}
      </Button>
    </form>
  );
}
