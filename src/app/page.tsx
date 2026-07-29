import { redirect } from 'next/navigation';
import { getOptionalUser } from '@/lib/auth/guards';
import { hasAnyUser } from '@/lib/auth/bootstrap';

export default async function HomePage() {
  // Bootstrap gate: if DB has no users yet, send to /setup so they can be created.
  if (!(await hasAnyUser())) redirect('/setup');
  const u = await getOptionalUser();
  if (!u) redirect('/login');
  if (!u.activeStoreId) redirect('/stores');
  redirect('/dashboard');
}
