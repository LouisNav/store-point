import { jsPDF } from 'jspdf';
import type { Sale, SaleItem } from './types';
import { formatMoney } from './utils';

interface ReceiptData {
  sale: Sale;
  items: SaleItem[];
  storeName: string;
  storeTagline?: string;
  cashierName: string;
  customerName?: string;
  currency: string;
  currencySymbol?: string;
  logoDataUrl?: string;
}

export function generateReceiptPdf(data: ReceiptData): Buffer {
  const { sale, items, storeName, storeTagline, cashierName, customerName, currency, currencySymbol, logoDataUrl } = data;
  const doc = new jsPDF({ unit: 'mm', format: [80, 200] });
  const M = 5; // margin
  let y = M + 2;
  const W = 70; // usable width

  // Header
  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, 'PNG', (doc.internal.pageSize.getWidth() - 12) / 2, y, 12, 12);
      y += 14;
    } catch {
      /* ignore bad logos */
    }
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(storeName, doc.internal.pageSize.getWidth() / 2, y, { align: 'center' });
  y += 5;

  if (storeTagline) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7);
    doc.text(storeTagline, doc.internal.pageSize.getWidth() / 2, y, { align: 'center' });
    y += 4;
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text(`Receipt #${sale.receiptNumber}`, doc.internal.pageSize.getWidth() / 2, y, { align: 'center' });
  y += 3.5;
  doc.text(new Date(sale.createdAt).toLocaleString(), doc.internal.pageSize.getWidth() / 2, y, { align: 'center' });
  y += 3.5;

  // Separator
  doc.setDrawColor(180);
  doc.setLineWidth(0.1);
  y += 1;
  doc.line(M, y, M + W, y);
  y += 3;

  // Info
  doc.setFontSize(7);
  if (customerName) {
    doc.text(`Customer: ${customerName}`, M, y);
    y += 3.5;
  }
  doc.text(`Cashier: ${cashierName}`, M, y);
  y += 3.5;
  doc.text(`Payment: ${sale.paymentMethod}`, M, y);
  y += 4;

  // Separator
  doc.line(M, y, M + W, y);
  y += 3;

  // Items header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.text('Item', M, y);
  doc.text('Qty', M + 43, y, { align: 'center' });
  doc.text('Total', M + W, y, { align: 'right' });
  y += 3.5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);

  for (const item of items) {
    // Truncate long names
    const name = item.productName.length > 22 ? item.productName.slice(0, 21) + '\u2026' : item.productName;
    doc.text(name, M, y);
    doc.text(String(item.qty), M + 43, y, { align: 'center' });
    doc.text(formatMoney(item.lineTotalCents, currency, currencySymbol), M + W, y, { align: 'right' });
    y += 3.5;

    // Add unit price line
    doc.setFontSize(5.5);
    doc.setTextColor(100);
    doc.text(`SKU ${item.productSku} \u00B7 ${formatMoney(item.sellCentsSnapshot, currency, currencySymbol)} ea`, M + 2, y);
    doc.setTextColor(0);
    doc.setFontSize(6.5);
    y += 3;
  }

  // Separator
  y += 1;
  doc.line(M, y, M + W, y);
  y += 3;

  // Totals
  doc.setFontSize(7);
  doc.text('Subtotal', M, y);
  doc.text(formatMoney(sale.subtotalCents, currency, currencySymbol), M + W, y, { align: 'right' });
  y += 4;

  if (sale.discountCents > 0) {
    doc.text('Discount', M, y);
    doc.text(`-${formatMoney(sale.discountCents, currency, currencySymbol)}`, M + W, y, { align: 'right' });
    y += 4;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('TOTAL', M, y);
  doc.text(formatMoney(sale.totalCents, currency, currencySymbol), M + W, y, { align: 'right' });
  y += 6;

  // Footer
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.setTextColor(120);
  doc.text('Thank you for your purchase!', doc.internal.pageSize.getWidth() / 2, y, { align: 'center' });
  y += 3.5;
  doc.text(`Status: ${sale.status.replace('_', ' ')}`, doc.internal.pageSize.getWidth() / 2, y, { align: 'center' });

  return Buffer.from(doc.output('arraybuffer'));
}
