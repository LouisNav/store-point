// Shared currency presets. The app supports any currency: stores carry an ISO
// (or custom) code plus an optional display symbol override, so operators
// anywhere can run the register in their local currency.

export interface CurrencyPreset {
  code: string;
  symbol: string;
  name: string;
}

export const CURRENCY_PRESETS: CurrencyPreset[] = [
  { code: 'USD', symbol: '$', name: 'US Dollar' },
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'GBP', symbol: '£', name: 'British Pound' },
  { code: 'NGN', symbol: '₦', name: 'Nigerian Naira' },
  { code: 'KES', symbol: 'KSh', name: 'Kenyan Shilling' },
  { code: 'GHS', symbol: '₵', name: 'Ghanaian Cedi' },
  { code: 'ZAR', symbol: 'R', name: 'South African Rand' },
  { code: 'INR', symbol: '₹', name: 'Indian Rupee' },
  { code: 'CAD', symbol: 'CA$', name: 'Canadian Dollar' },
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar' },
  { code: 'JPY', symbol: '¥', name: 'Japanese Yen' },
  { code: 'CNY', symbol: '¥', name: 'Chinese Yuan' },
  { code: 'AED', symbol: 'د.إ', name: 'UAE Dirham' },
  { code: 'SAR', symbol: '﷼', name: 'Saudi Riyal' },
  { code: 'BDT', symbol: '৳', name: 'Bangladeshi Taka' },
  { code: 'PKR', symbol: '₨', name: 'Pakistani Rupee' },
  { code: 'EGP', symbol: 'E£', name: 'Egyptian Pound' },
  { code: 'MXN', symbol: 'MX$', name: 'Mexican Peso' },
  { code: 'BRL', symbol: 'R$', name: 'Brazilian Real' },
  { code: 'PHP', symbol: '₱', name: 'Philippine Peso' },
  { code: 'IDR', symbol: 'Rp', name: 'Indonesian Rupiah' },
  { code: 'TZS', symbol: 'TSh', name: 'Tanzanian Shilling' },
  { code: 'UGX', symbol: 'USh', name: 'Ugandan Shilling' },
  { code: 'RWF', symbol: 'FRw', name: 'Rwandan Franc' },
  { code: 'ETB', symbol: 'Br', name: 'Ethiopian Birr' },
  { code: 'XOF', symbol: 'CFA', name: 'West African CFA Franc' },
  { code: 'XAF', symbol: 'FCFA', name: 'Central African CFA Franc' },
  { code: 'ZMW', symbol: 'ZK', name: 'Zambian Kwacha' },
];

/** Sentinel used by currency pickers to mean "type your own code/symbol". */
export const CUSTOM_CURRENCY = 'CUSTOM';

export function findPreset(code: string): CurrencyPreset | undefined {
  const upper = code.trim().toUpperCase();
  return CURRENCY_PRESETS.find((p) => p.code === upper);
}

export function presetOptions(): Array<{ value: string; label: string }> {
  return [
    ...CURRENCY_PRESETS.map((p) => ({ value: p.code, label: `${p.code} · ${p.symbol} — ${p.name}` })),
    { value: CUSTOM_CURRENCY, label: 'Custom currency…' },
  ];
}
