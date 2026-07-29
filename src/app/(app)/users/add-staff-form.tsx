'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { SelectInput } from '@/components/ui/select';
import { FormLabel } from '@/components/ui/label';
import { addStaff } from './actions';
import { ROLE_LABEL } from '@/lib/rbac';
import type { Role } from '@/lib/types';

const schema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6, 'Min 6 chars'),
  role: z.enum(['ROOT_ADMIN', 'MANAGER', 'INVENTORY', 'SALES_AGENT', 'VIEWER']),
});
type V = z.infer<typeof schema>;

export function AddStaffForm({
  storeId,
  availableRoles,
  onClose,
}: {
  storeId: string;
  availableRoles: Role[];
  onClose?: () => void;
}) {
  const router = useRouter();
  const { control, register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<V>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', email: '', password: '', role: 'SALES_AGENT' },
  });

  async function onSubmit(v: V) {
    const r = await addStaff(storeId, v);
    if (r?.error) return toast.error(r.error);
    toast.success(`${v.name} added`);
    reset();
    router.refresh();
    onClose?.();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
      <div>
        <FormLabel required hint="Staff member's full name as shown in the store">Name</FormLabel>
        <Input placeholder="Full name" {...register('name')} />
        {errors.name && <p className="mt-1 text-xs text-destructive">{errors.name.message}</p>}
      </div>
      <div>
        <FormLabel required hint="They'll use this email address to sign in">Email</FormLabel>
        <Input type="email" placeholder="staff@store.com" {...register('email')} />
        {errors.email && <p className="mt-1 text-xs text-destructive">{errors.email.message}</p>}
      </div>
      <div>
        <FormLabel required hint="They sign in with this">Password</FormLabel>
        <Input type="password" placeholder="At least 6 chars" {...register('password')} />
        {errors.password && <p className="mt-1 text-xs text-destructive">{errors.password.message}</p>}
      </div>
      <div>
        <FormLabel required hint="Determines what this person can see and do in the store">Role</FormLabel>
        <Controller
          control={control}
          name="role"
          render={({ field }) => (
            <SelectInput
              value={field.value}
              onValueChange={field.onChange}
              options={availableRoles.map((r) => ({ value: r, label: ROLE_LABEL[r] }))}
            />
          )}
        />
      </div>
      <Button type="submit" disabled={isSubmitting} className="w-full">
        {isSubmitting ? 'Adding…' : 'Add to staff'}
      </Button>
    </form>
  );
}
