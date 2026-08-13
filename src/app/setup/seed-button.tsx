'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Rocket } from 'lucide-react';
import { bootstrapRootFromEnv } from '@/app/(app)/users/actions';

export function SeedButton({ available }: { available: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true);
    const r = await bootstrapRootFromEnv();
    setBusy(false);
    if (r?.error) {
      toast.error(r.error);
      return;
    }
    toast.success('Account and sample store created — please sign in.');
    router.push('/login');
  }
  return (
    <Button onClick={go} disabled={!available || busy} size="lg">
      <Rocket className="h-4 w-4" />
      {busy ? 'Bootstrapping…' : 'Create account & sample store'}
    </Button>
  );
}
