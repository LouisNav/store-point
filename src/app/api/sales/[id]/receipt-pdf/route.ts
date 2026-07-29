import { NextResponse } from 'next/server';
import { requireActiveStore } from '@/lib/auth/guards';
import { salesRepo } from '@/lib/db/repositories/sales.repo';
import { storesRepo } from '@/lib/db/repositories/stores.repo';
import { customersRepo } from '@/lib/db/repositories/customers.repo';
import { usersRepo } from '@/lib/db/repositories/users.repo';
import { generateReceiptPdf } from '@/lib/pdf-receipt';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { storeId } = await requireActiveStore();
  const store = storesRepo.byId(storeId);
  const sale = salesRepo.byId(storeId, id);

  if (!store || !sale) {
    return new NextResponse('Not found', { status: 404 });
  }

  const items = salesRepo.items(sale.id);
  const cashier = usersRepo.byId(sale.cashierId);
  const customer = sale.customerId ? customersRepo.byId(storeId, sale.customerId) : null;

  let logoDataUrl: string | undefined;
  try {
    const brand = JSON.parse(store.brandJson || '{}');
    if (brand.logoDataUrl) logoDataUrl = brand.logoDataUrl;
  } catch {
    /* ignore */
  }

  let tagline: string | undefined;
  let currencySymbol: string | undefined;
  try {
    const brand = JSON.parse(store.brandJson || '{}');
    if (brand.tagline) tagline = brand.tagline;
    if (brand.currencySymbol) currencySymbol = brand.currencySymbol;
  } catch {
    /* ignore */
  }

  const pdf = generateReceiptPdf({
    sale,
    items,
    storeName: store.name,
    storeTagline: tagline,
    cashierName: cashier?.name ?? 'Unknown',
    customerName: customer?.name,
    currency: store.currency,
    currencySymbol,
    logoDataUrl,
  });

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="receipt-${sale.receiptNumber}.pdf"`,
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
