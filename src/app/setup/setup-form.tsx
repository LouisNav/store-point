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
import { CUSTOM_CURRENCY, findPreset, presetOptions } from '@/lib/currency';
import { formatMoney } from '@/lib/utils';

export function SetupForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [currencyPreset, setCurrencyPreset] = useState<string>('USD');
  const [customCode, setCustomCode] = useState('');
  const [customSymbol, setCustomSymbol] = useState('');

  const isCustom = currencyPreset === CUSTOM_CURRENCY;
  const previewCode = isCustom ? (customCode.trim().toUpperCase() || 'USD') : currencyPreset;
  const previewSymbol = isCustom ? customSymbol.trim() : (findPreset(currencyPreset)?.symbol ?? '');

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const fd = new FormData(e.currentTarget);
      const code = isCustom ? customCode.trim().toUpperCase() : currencyPreset;
      const symbol = isCustom ? customSymbol.trim() : (findPreset(currencyPreset)?.symbol ?? '');
      const result = await bootstrapManually({
        email: String(fd.get('email') || '').trim(),
        password: String(fd.get('password') || ''),
        name: String(fd.get('name') || 'Root').trim(),
        storeName: String(fd.get('storeName') || '').trim(),
        currency: code,
        currencySymbol: symbol,
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
          <Label htmlFor="email">Owner email</Label>
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
      <div className="space-y-1.5">
        <Label htmlFor="storeName">Store name</Label>
        <Input id="storeName" name="storeName" type="text" required placeholder="Greenmarket Demo" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="currency">Currency</Label>
        <SelectInput
          id="currency"
          value={currencyPreset}
          onValueChange={setCurrencyPreset}
          options={presetOptions()}
        />
        {isCustom ? (
          <div className="grid grid-cols-2 gap-3 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="customCode">Currency code</Label>
              <Input
                id="customCode"
                value={customCode}
                onChange={(e) => setCustomCode(e.target.value)}
                placeholder="e.g. KWD"
                maxLength={8}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="customSymbol">Symbol</Label>
              <Input
                id="customSymbol"
                value={customSymbol}
                onChange={(e) => setCustomSymbol(e.target.value)}
                placeholder="e.g. د.ك"
                maxLength={10}
              />
            </div>
          </div>
        ) : (
          <p className="pt-1 text-xs text-muted-foreground">
            Sample: <span className="font-medium">{formatMoney(5599, previewCode, previewSymbol || undefined)}</span>
          </p>
        )}
      </div>
      <label className="flex cursor-pointer items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm">
        <input
          type="checkbox"
          name="demoData"
          defaultChecked
          className="h-4 w-4 rounded border-gray-300 text-primary"
        />
        <span>
          Add sample products so you can try the cash register right away.
        </span>
      </label>
      {err && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {err}
        </div>
      )}
      <Button type="submit" disabled={busy} size="lg" className="w-full">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        {busy ? 'Setting up…' : 'Create account and get started'}
      </Button>
    </form>
  );
}
