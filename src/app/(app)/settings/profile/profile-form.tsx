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
import { updateProfile } from './actions';

const schema = z
  .object({
    name: z.string().min(1),
    email: z.string().email(),
    currentPassword: z.string().min(1, 'Required to save changes'),
    newPassword: z.string().optional().default(''),
  })
  .refine((v) => !v.newPassword || v.newPassword.length >= 6, {
    path: ['newPassword'],
    message: 'Min 6 chars',
  });
type V = z.infer<typeof schema>;

export function ProfileForm({ initialName, initialEmail }: { initialName: string; initialEmail: string }) {
  const router = useRouter();
  const { register, handleSubmit, formState: { errors, isSubmitting }, reset } = useForm<V>({
    resolver: zodResolver(schema),
    defaultValues: { name: initialName, email: initialEmail, currentPassword: '', newPassword: '' },
  });

  async function onSubmit(v: V) {
    const r = await updateProfile(v);
    if (r?.error) return toast.error(r.error);
    toast.success('Profile updated');
    reset({ name: v.name, email: v.email, currentPassword: '', newPassword: '' });
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <FormLabel required>Full name</FormLabel>
        <Input {...register('name')} />
        {errors.name && <p className="mt-1 text-xs text-destructive">{errors.name.message}</p>}
      </div>
      <div>
        <FormLabel required hint="Used to sign in and receive receipts">Email</FormLabel>
        <Input type="email" {...register('email')} />
        {errors.email && <p className="mt-1 text-xs text-destructive">{errors.email.message}</p>}
      </div>
      <div className="border-t pt-3">
        <FormLabel required>Current password</FormLabel>
        <Input type="password" placeholder="Required to save any changes" {...register('currentPassword')} />
        {errors.currentPassword && <p className="mt-1 text-xs text-destructive">{errors.currentPassword.message}</p>}
      </div>
      <div>
        <FormLabel hint="Leave blank to keep your current password">New password</FormLabel>
        <Input type="password" placeholder="At least 6 chars" {...register('newPassword')} />
        {errors.newPassword && <p className="mt-1 text-xs text-destructive">{errors.newPassword.message}</p>}
        {errors.name && <p className="mt-1 text-xs text-destructive">{errors.name.message}</p>}
      </div>

      <Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Saving…' : 'Save profile'}</Button>
    </form>
  );
}
