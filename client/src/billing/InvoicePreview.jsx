import React from 'react';
import { currency, dateTime } from '../utils/format.js';
import { normalizeInvoiceSale } from '../utils/print.js';

export default function InvoicePreview({ sale, settings = {}, state = {}, totals = {}, cart = [] }) {
  const invoice = normalizeInvoiceSale(sale || { state, totals, cart }, settings);

  return (
    <div id="invoice-print" className="rounded-lg border border-slate-200 bg-white p-4 font-mono text-xs shadow-sm dark:border-slate-800">
      <div className="text-center">
        <div className="text-sm font-bold uppercase">{invoice.storeName}</div>
        {invoice.storeAddress ? <div className="text-[10px] text-slate-500">{invoice.storeAddress}</div> : null}
        {invoice.gstNumber ? <div className="text-[10px] text-slate-500">GST: {invoice.gstNumber}</div> : null}
      </div>

      <div className="my-2 border-t border-dashed" />

      <div className="space-y-1 text-[11px]">
        <div className="flex justify-between"><span>Invoice</span><span>{invoice.invoiceNumber}</span></div>
        <div className="flex justify-between"><span>Date</span><span>{dateTime(invoice.invoiceDate)}</span></div>
        <div className="flex justify-between"><span>Customer</span><span>{invoice.customerName}</span></div>
        {invoice.customerMobile ? <div className="flex justify-between"><span>Mobile</span><span>{invoice.customerMobile}</span></div> : null}
      </div>

      <div className="my-2 border-t border-dashed" />

      <div className="max-h-64 space-y-2 overflow-y-auto">
        {invoice.items.length ? invoice.items.map((item) => (
          <div key={item.key} className="border-b border-slate-100 pb-1">
            <div className="flex justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-[12px] font-semibold">{item.name}</div>
                {item.sku ? <div className="text-[10px] text-slate-500">{item.sku}</div> : null}
                <div className="text-[10px] text-slate-400">{item.quantity} x {currency(item.price)} | GST {item.gstRate}%</div>
              </div>
              <div className="text-right text-[11px] font-bold">{currency(item.lineTotal)}</div>
            </div>
          </div>
        )) : (
          <div className="py-4 text-center text-slate-400">No items added</div>
        )}
      </div>

      <div className="my-2 border-t border-dashed" />

      <div className="space-y-1 text-[11px]">
        <div className="flex justify-between"><span>Subtotal</span><span>{currency(invoice.subtotal)}</span></div>
        <div className="flex justify-between"><span>Discount</span><span>{currency(invoice.discount)}</span></div>
        <div className="flex justify-between"><span>GST</span><span>{currency(invoice.taxTotal)}</span></div>
        <div className="mt-2 flex justify-between border-t pt-2 text-sm font-bold"><span>Grand Total</span><span>{currency(invoice.total)}</span></div>
        <div className="flex justify-between"><span>Payment</span><span>{String(invoice.paymentMethod).toUpperCase()}</span></div>
        {invoice.balanceAmount > 0 ? <div className="flex justify-between font-bold text-orange-700"><span>Due</span><span>{currency(invoice.balanceAmount)}</span></div> : null}
      </div>

      <div className="mt-4 border-t border-dashed pt-2 text-center text-[10px] text-slate-500">
        {invoice.invoiceFooter}
      </div>
    </div>
  );
}
