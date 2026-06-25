import { makeReceiptBodyHtml, makeReceiptCss } from '../utils/print.js';

export function InvoicePreview({
  sale,
  settings = {},
  state = {},
  totals = {},
  cart = []
}) {
  const receiptSale = sale || { state, totals, cart };

  return (
    <div
      id="invoice-print"
      className="mx-auto overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm"
      style={{ width: settings?.receiptWidth === '58mm' || settings?.thermalPaperWidth === '58mm' ? '58mm' : settings?.receiptWidth === 'A4' ? '210mm' : '80mm' }}
    >
      <style>{makeReceiptCss(settings, { preview: true })}</style>
      <div dangerouslySetInnerHTML={{ __html: makeReceiptBodyHtml(receiptSale, settings) }} />
    </div>
  );
}
