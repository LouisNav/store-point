// Per-store branding: turn a Store.brandJson into CSS variables for the layout.

import type { Brand } from './types';
import { parseBrand } from './db/repositories/stores.repo';

/** HSL values expected by shadcn tokens. Convert hex → "H S% L%". */
export function hexToHSL(hex: string): string {
  let h = hex.replace('#', '').trim();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let hue = 0;
  let sat = 0;
  const light = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    sat = light > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        hue = ((g - b) / d + (g < b ? 6 : 0)) * 60;
        break;
      case g:
        hue = ((b - r) / d + 2) * 60;
        break;
      case b:
        hue = ((r - g) / d + 4) * 60;
        break;
    }
  }
  return `${Math.round(hue)} ${Math.round(sat * 100)}% ${Math.round(light * 100)}%`;
}

/** Compute readable foreground (black/white) for an HSL background. */
export function fgForHSL(hslBg: string): string {
  const parts = hslBg.split(' ');
  const light = parseFloat(parts[2]);
  return light > 55 ? '0 0% 12%' : '0 0% 98%';
}

/**
 * Returns a block of inline CSS that overrides the shadcn theme tokens for one
 * store. `!important` is used here so brand vars reliably win against the
 * `@layer base` baseline declared in globals.css, regardless of how the
 * cascade order evolves later.
 */
export function brandToThemeCss(brandJson: string | undefined | null): string {
  const brand: Brand = brandJson ? parseBrand(brandJson) : {};
  const accent = brand.accent ?? '#0ea5e9';
  const hslAccent = hexToHSL(accent);
  const fg = brand.accentFg ?? fgForHSL(hslAccent);
  // Override shadcn tokens that use case classes (cards, buttons, etc.).
  // !important lets per-store branding always win over the global defaults.
  return `:root{--primary:${hslAccent} !important;--primary-foreground:${fg} !important;--ring:${hslAccent} !important;--accent:${hslAccent} !important;--accent-foreground:${fg} !important;}`;
}

/** Public-safe brand for the UI (logo + tagline). */
export function publicBrand(brandJson: string | undefined | null): {
  name?: string;
  tagline?: string;
  logoDataUrl?: string;
  accent?: string;
} {
  return brandJson ? parseBrand(brandJson) : {};
}
