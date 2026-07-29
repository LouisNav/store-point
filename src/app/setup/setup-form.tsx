'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SelectInput } from '@/components/ui/select';
import { Loader2, Sparkles } from 'lucide-react';
import { bootstrapManually } from './actions';

const CURRENCIES = [
  { value: 'USD', label: 'USD $' },
  { value: 'NGN', label: 'NGN ₦' },
  { value: 'EUR', label: 'EUR €' },
  { value: 'GBP', label: 'GBP £' },
  { value: 'KES', label: 'KES KSh' },
  { value: 'GHS', label: 'GHS ₵' },
  { value: 'ZAR', label: 'ZAR R' },
  { value: 'INR', label: 'INR ₹' },
];

export function SetupForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [currency, setCurrency] = useState<string>('USD');

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const fd = new FormData(e.currentTarget);
      const result = await bootstrapManually({
        email: String(fd.get('email') || '').trim(),
        password: String(fd.get('password') || ''),
        name: String(fd.get('name') || 'Root').trim(),
        storeName: String(fd.get('storeName') || '').trim(),
        currency, // controlled state
        demoData: fd.get('demoData') === 'on',
      });
      if (result.ok && result.status === 'created') {
        toast.success('Store Point is ready. Sign in to continue.');
        router.push('/login');
      } else if (result.ok && result.status === 'exists') {
        toast.message('A root admin already exists. Redirecting to sign-in…');
        router.push('/login');
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="email">Root admin email</Label>
          <Input id="email" name="email" type="email" required placeholder="you@example.com" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="name">Display name</Label>
          <Input id="name" name="name" type="text" defaultValue="Owner" maxLength={80} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password">Password</Label>
        <Input id="password" name="password" type="password" required minLength={8} placeholder="≥ 8 characters" />
        <p className="text-xs text-muted-foreground">Use a strong passphrase you'll remember.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
        <div className="space-y-1.5">
          <Label htmlFor="storeName">First store name</Label>
          <Input id="storeName" name="storeName" type="text" required placeholder="Greenmarket Demo" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="currency">Currency</Label>
          <SelectInput
            id="currency"
            value={currency}
            onValueChange={setCurrency}
            options={CURRENCIES}
          />
        </div>
      </div>
      <label className="flex cursor-pointer items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm">
        <input
          type="checkbox"
          name="demoData"
          defaultChecked
          className="h-4 w-4 rounded border-gray-300 text-primary"
        />
        <span>
          Add sample products (rice, oil, beans, sugar, milk, bread) so you can try the cash register right
          away.
        </span>
      </label>
      {err && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {err}
        </div>
      )}
      <Button type="submit" disabled={busy} size="lg" className="w-full">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        {busy ? 'Setting up…' : 'Create owner + store and sign in'}
      </Button>
    </form>
  );
}
