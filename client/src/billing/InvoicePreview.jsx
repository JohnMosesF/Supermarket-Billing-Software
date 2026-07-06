import React from 'react';
import { makeReceiptBodyHtml, makeReceiptCss } from '../utils/print.js';

export default function InvoicePreview({ sale, settings = {}, state = {}, totals = {}, cart = [] }) {
  const receiptSale = sale || { state, totals, cart };
  const width = settings?.receiptWidth === '58mm' || settings?.thermalPaperWidth === '58mm'
    ? '58mm'
    : settings?.receiptWidth === '72mm' || settings?.thermalPaperWidth === '72mm'
      ? '72mm'
      : settings?.receiptWidth === 'A4'
        ? '210mm'
        : '80mm';

  return (
    <div
      id="invoice-print"
      className="mx-auto overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800"
      style={{ width }}
    >
      <style>{makeReceiptCss(settings, { preview: true })}</style>
      <div dangerouslySetInnerHTML={{ __html: makeReceiptBodyHtml(receiptSale, settings) }} />
    </div>
  );
}
