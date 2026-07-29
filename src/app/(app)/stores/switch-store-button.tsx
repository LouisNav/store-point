'use client';
import { useRouter } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function SwitchStoreButton({ storeId }: { storeId: string }) {
  const router = useRouter();
  async function go() {
    await fetch('/api/stores/switch', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ storeId }),
    });
    router.push('/dashboard');
    router.refresh();
  }
  return (
    <Button onClick={go} variant="outline" size="sm" className="w-full">
      Switch to this store <ArrowRight className="h-4 w-4" />
    </Button>
  );
}
