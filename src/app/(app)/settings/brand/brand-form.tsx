'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { FormLabel } from '@/components/ui/label';
import { Save, Upload } from 'lucide-react';
import { saveBrand } from './actions';

interface Initial {
  storeName: string;
  currency: string;
  tagline: string;
  accent: string;
  logoDataUrl: string;
  currencySymbol: string;
}

const PRESET_ACCENTS = ['#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#0f172a', '#475569'];

export function BrandForm({ storeId, initial }: { storeId: string; initial: Initial }) {
  const router = useRouter();
  const [values, setValues] = React.useState(initial);
  const [busy, setBusy] = React.useState(false);

  function readLogo(file: File) {
    if (file.size > 200_000) {
      toast.error('Logo must be under 200KB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setValues((v) => ({ ...v, logoDataUrl: String(reader.result) }));
    reader.readAsDataURL(file);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const r = await saveBrand(storeId, values);
    setBusy(false);
    if (r?.error) return toast.error(r.error);
    toast.success('Brand updated');
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <FormLabel required>Store name</FormLabel>
          <Input value={values.storeName} onChange={(e) => setValues({ ...values, storeName: e.target.value })} />
        </div>
        <div>
          <FormLabel required hint="3-letter ISO code">Currency</FormLabel>
          <Input value={values.currency} onChange={(e) => setValues({ ...values, currency: e.target.value.toUpperCase() })} />
        </div>
        <div>
          <FormLabel hint="e.g. ₦, $, KSh — overrides ISO symbol">Currency symbol</FormLabel>
          <Input
            value={values.currencySymbol}
            onChange={(e) => setValues({ ...values, currencySymbol: e.target.value })}
            placeholder={values.currency}
            maxLength={10}
          />
        </div>
        <div className="sm:col-span-2">
          <FormLabel hint="Shown under the logo on receipts and dashboard">Tagline</FormLabel>
          <Input value={values.tagline} onChange={(e) => setValues({ ...values, tagline: e.target.value })} />
        </div>
      </div>

      <div>
        <FormLabel hint="Used for buttons, links and highlights">Accent color</FormLabel>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="color"
            value={values.accent}
            onChange={(e) => setValues({ ...values, accent: e.target.value })}
            className="h-10 w-16 cursor-pointer rounded-md border bg-background"
          />
          <Input
            value={values.accent}
            onChange={(e) => setValues({ ...values, accent: e.target.value })}
            className="max-w-[10rem]"
          />
          <div className="flex flex-wrap gap-1.5">
            {PRESET_ACCENTS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setValues({ ...values, accent: c })}
                className="h-7 w-7 rounded-full ring-2 ring-transparent hover:ring-primary/60"
                style={{ background: c }}
                aria-label={`Use accent ${c}`}
              />
            ))}
          </div>
        </div>
      </div>

      <div>
        <FormLabel hint="Square image, ideally 256×256, &lt; 200KB">Logo</FormLabel>
        <div className="flex items-center gap-4">
          <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-md border bg-muted">
            {values.logoDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={values.logoDataUrl} alt="logo" className="h-full w-full object-cover" />
            ) : (
              <span className="text-xs text-muted-foreground">No logo</span>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <label className="inline-flex">
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) readLogo(f);
                }}
              />
              <span className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border bg-card px-3 py-1.5 text-sm">
                <Upload className="h-4 w-4" /> Upload image
              </span>
            </label>
            {values.logoDataUrl && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setValues({ ...values, logoDataUrl: '' })}
                className="justify-start text-destructive"
              >
                Remove logo
              </Button>
            )}
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Logos are stored as small data URLs so they survive both local storage and offline sync.
        </p>
      </div>

      <div className="rounded-md border bg-muted/40 p-3">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">Preview</div>
        <div className="mt-2 flex items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-md text-white"
            style={{ background: values.accent }}
          >
            🏬
          </div>
          <div>
            <div className="font-semibold">{values.storeName || 'Your store'}</div>
            <div className="text-xs italic text-muted-foreground">{values.tagline || 'Your tagline'}</div>
          </div>
        </div>
        <Button variant="outline" size="sm" className="mt-3" disabled style={{ background: values.accent, color: 'white', border: 0 }}>
          Sample button
        </Button>
      </div>

      <div className="border-t pt-4">
        <Button type="submit" disabled={busy}>
          <Save className="h-4 w-4" /> Save changes
        </Button>
      </div>
    </form>
  );
}
