'use server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/guards';
import { usersRepo } from '@/lib/db/repositories/users.repo';
import { verifyPassword } from '@/lib/auth/password';

const schema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  currentPassword: z.string().min(1, 'Enter your current password to save changes.'),
  newPassword: z.string().optional().default(''),
});

export async function updateProfile(input: z.infer<typeof schema>) {
  const session = await requireUser();
  if (!session.userId) return { error: 'Unauthorized' };
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  // Verify current password for all changes
  const user = usersRepo.byId(session.userId);
  if (!user) return { error: 'User not found' };
  const ok = await verifyPassword(parsed.data.currentPassword, user.passwordHash);
  if (!ok) return { error: 'Current password is wrong.' };

  // Update name + email
  usersRepo.updateBasics(session.userId, {
    name: parsed.data.name,
    email: parsed.data.email,
  });
  session.name = parsed.data.name;
  session.email = parsed.data.email;

  // Update password if provided
  if (parsed.data.newPassword) {
    await usersRepo.setPassword(session.userId, parsed.data.newPassword);
  }

  await session.save();
  revalidatePath('/settings/profile');
  return { ok: true };
}
