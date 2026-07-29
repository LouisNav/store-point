import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireActiveStore } from '@/lib/auth/guards';
import { salesRepo } from '@/lib/db/repositories/sales.repo';
import { storesRepo, parseBrand } from '@/lib/db/repositories/stores.repo';
import { customersRepo } from '@/lib/db/repositories/customers.repo';
import { usersRepo } from '@/lib/db/repositories/users.repo';
import { Button } from '@/components/ui/button';
import { formatMoney, formatDate, getCurrencySymbol } from '@/lib/utils';
import { ArrowLeft, Printer, Download } from 'lucide-react';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ReceiptPage({ params }: PageProps) {
  const { id } = await params;
  const { storeId } = await requireActiveStore();
  const store = storesRepo.byId(storeId)!;
  const sale = salesRepo.byId(storeId, id);
  if (!sale) notFound();
  const items = salesRepo.items(sale.id);
  const cashier = usersRepo.byId(sale.cashierId);
  const customer = sale.customerId ? customersRepo.byId(storeId, sale.customerId) : null;
  const brand = parseBrand(store.brandJson);
  const sym = brand.currencySymbol || undefined;

  return (
    <div className="mx-auto max-w-sm">
      <div className="no-print mb-3 flex items-center justify-between">
        <Button asChild variant="ghost" size="sm">
          <Link href={`/sales/${sale.id}`}>
            <ArrowLeft className="h-4 w-4" /> Back
          </Link>
        </Button>
        <div className="flex gap-2">
          <PdfDownloadBtn saleId={sale.id} />
          <PrintBtn />
        </div>
      </div>
      <div className="rounded-md border bg-white p-6 font-mono text-sm text-black shadow-sm">
        <div className="text-center">
          {brand.logoDataUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={brand.logoDataUrl} alt="logo" className="mx-auto mb-2 h-10 w-10 object-cover" />
          )}
          <h1 className="text-lg font-bold">{store.name}</h1>
          {brand.tagline && <p className="text-xs italic">{brand.tagline}</p>}
          <p className="mt-1 text-xs">Receipt #{sale.receiptNumber}</p>
          <p className="text-xs">{formatDate(sale.createdAt)}</p>
        </div>
        <hr className="my-3 border-dashed border-black/30" />
        {customer && (
          <p className="mb-2 text-xs">
            Customer: <strong>{customer.name}</strong>
          </p>
        )}
        <p className="mb-2 text-xs">Cashier: {cashier?.name ?? '—'}</p>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-dashed border-black/30">
              <th className="py-1 text-left font-semibold">Item</th>
              <th className="py-1 text-right font-semibold">Qty</th>
              <th className="py-1 text-right font-semibold">Total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id}>
                <td className="py-1 pr-2">
                  {it.productName}
                  <br />
                  <span className="text-[10px] text-black/60">SKU {it.productSku} · {formatMoney(it.sellCentsSnapshot, store.currency, sym)}</span>
                </td>
                <td className="py-1 text-right align-top">{it.qty}</td>
                <td className="py-1 text-right align-top">{formatMoney(it.lineTotalCents, store.currency, sym)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <hr className="my-3 border-dashed border-black/30" />
        <div className="space-y-1 text-xs">
          <div className="flex justify-between"><span>Subtotal</span><span>{formatMoney(sale.subtotalCents, store.currency, sym)}</span></div>
          {sale.discountCents > 0 && (
            <div className="flex justify-between"><span>Discount</span><span>-{formatMoney(sale.discountCents, store.currency, sym)}</span></div>
          )}
          <div className="mt-1 flex justify-between border-t border-dashed border-black/30 pt-1 text-base font-bold">
            <span>TOTAL</span>
            <span>{formatMoney(sale.totalCents, store.currency, sym)}</span>
          </div>
          <div className="flex justify-between"><span>Payment</span><span className="capitalize">{sale.paymentMethod}</span></div>
          <div className="flex justify-between"><span>Status</span><span className="uppercase">{sale.status}</span></div>
        </div>
        <hr className="my-3 border-dashed border-black/30" />
        <p className="text-center text-[10px]">Thank you for your purchase!</p>
      </div>
    </div>
  );
}

function PrintBtn() {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => {
        if (typeof window !== 'undefined') window.print();
      }}
    >
      <Printer className="h-4 w-4" /> Print
    </Button>
  );
}

function PdfDownloadBtn({ saleId }: { saleId: string }) {
  return (
    <Button variant="outline" size="sm" asChild>
      <Link href={`/api/sales/${saleId}/receipt-pdf`} target="_blank" rel="noopener noreferrer">
        <Download className="h-4 w-4" /> PDF
      </Link>
    </Button>
  );
}
