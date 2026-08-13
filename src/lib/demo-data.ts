// Demo product catalog. Base prices are expressed in USD cents (minor units);
// each currency scales them to its typical minor-unit magnitude so the sample
// store always shows believable prices for the operator's local currency.

export interface DemoProduct {
  sku: string;
  name: string;
  costCents: number;
  sellCents: number;
  stockQty: number;
  lowStockThreshold?: number;
  description?: string;
}

const BASE: DemoProduct[] = [
  { sku: 'RICE-5KG', name: 'Premium Rice 5kg', costCents: 450, sellCents: 550, stockQty: 24, description: 'Long-grain rice' },
  { sku: 'OIL-1L', name: 'Cooking Oil 1L', costCents: 320, sellCents: 480, stockQty: 50 },
  { sku: 'BEANS-2KG', name: 'Brown Beans 2kg', costCents: 500, sellCents: 650, stockQty: 18, lowStockThreshold: 10 },
  { sku: 'SUGAR-1KG', name: 'Sugar 1kg', costCents: 150, sellCents: 220, stockQty: 36 },
  { sku: 'MILK-1L', name: 'Long-life Milk 1L', costCents: 180, sellCents: 260, stockQty: 12, lowStockThreshold: 6 },
  { sku: 'BREAD-W', name: 'Whole-wheat Bread', costCents: 90, sellCents: 140, stockQty: 8, lowStockThreshold: 10 },
];

/**
 * Approximate price scale per currency (relative to USD). Keeps demo prices in
 * the right order of magnitude — e.g. ₦5,500 for rice vs. $5.50 vs. Rp 88,000.
 * Unknown currencies fall back to 1 (USD-like minor units).
 */
const SCALE: Record<string, number> = {
  USD: 1, EUR: 1, GBP: 1, CAD: 1, AUD: 1,
  NGN: 1000,
  KES: 130,
  GHS: 15,
  ZAR: 18,
  INR: 83,
  JPY: 150,
  CNY: 7,
  AED: 4,
  SAR: 4,
  BDT: 110,
  PKR: 280,
  EGP: 48,
  MXN: 18,
  BRL: 5,
  PHP: 58,
  IDR: 16_000,
  TZS: 2_600,
  UGX: 3_800,
  RWF: 1_300,
  ETB: 120,
  XOF: 600,
  XAF: 600,
  ZMW: 27,
};

export function demoProducts(code: string): DemoProduct[] {
  const scale = SCALE[code.trim().toUpperCase()] ?? 1;
  if (scale === 1) return BASE.map((p) => ({ ...p }));
  return BASE.map((p) => ({
    ...p,
    costCents: Math.round(p.costCents * scale),
    sellCents: Math.round(p.sellCents * scale),
  }));
}
