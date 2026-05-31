import React from 'react';
import { currency } from '../utils/format.js';

export default function InvoicePreview({
  state = {},
  totals = {},
  cart = [],
}) {

  // Support both old and new cart structures
  const items = state.cart || cart || [];

  const subtotal =
    totals.subtotal ??
    items.reduce(
      (sum, item) =>
        sum +
        Number(item.rate || item.sellingPrice || 0) *
          Number(item.qty || item.quantity || 0),
      0
    );

  const taxTotal =
    totals.taxTotal ??
    items.reduce(
      (sum, item) =>
        sum +
        (
          Number(item.rate || item.sellingPrice || 0) *
          Number(item.qty || item.quantity || 0) *
          Number(item.gst || 0)
        ) /
          100,
      0
    );

  const discount = totals.discount || 0;

  const grandTotal =
    totals.total ??
    totals.grandTotal ??
    subtotal + taxTotal - discount;

  return (
    <div className="border border-slate-200 dark:border-slate-800 rounded-lg bg-white p-4 text-xs font-mono shadow-sm">

      {/* Header */}
      <div className="text-center">
        <div className="text-sm font-bold uppercase">
          Store Receipt
        </div>

        <div className="text-[11px] text-slate-500">
          Live Invoice Preview
        </div>
      </div>

      {/* Divider */}
      <div className="my-2 border-t border-dashed"></div>

      {/* Invoice Info */}
      <div className="space-y-1 text-[11px]">
        <div className="flex justify-between">
          <span>Invoice</span>
          <span>
            {state.invoiceNumber || 'N/A'}
          </span>
        </div>

        <div className="flex justify-between">
          <span>Customer</span>
          <span>
            {state.customerName || 'Walk-in'}
          </span>
        </div>
      </div>

      {/* Divider */}
      <div className="my-2 border-t border-dashed"></div>

      {/* Cart Items */}
      <div className="space-y-2 max-h-64 overflow-y-auto">
        {items.length === 0 ? (
          <div className="text-center text-slate-400 py-4">
            No items added
          </div>
        ) : (
          items.map((item, index) => {

            const qty =
              Number(item.qty || item.quantity || 0);

            const price =
              Number(item.rate || item.sellingPrice || 0);

            const itemTotal = qty * price;

            return (
              <div
                key={item._id || index}
                className="flex items-start justify-between border-b border-slate-100 pb-1"
              >
                <div className="flex-1 pr-2">
                  <div className="font-semibold text-[12px] leading-tight">
                    {item.name || item.productName}
                  </div>

                  <div className="text-[10px] text-slate-500">
                    {item.sku || item.code || ''}
                  </div>

                  <div className="text-[10px] text-slate-400">
                    {qty} × {currency(price)}
                  </div>
                </div>

                <div className="font-bold text-right text-[11px]">
                  {currency(itemTotal)}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Divider */}
      <div className="my-2 border-t border-dashed"></div>

      {/* Totals */}
      <div className="space-y-1 text-[11px]">

        <div className="flex justify-between">
          <span>Subtotal</span>
          <span>{currency(subtotal)}</span>
        </div>

        <div className="flex justify-between">
          <span>GST</span>
          <span>{currency(taxTotal)}</span>
        </div>

        <div className="flex justify-between">
          <span>Discount</span>
          <span>{currency(discount)}</span>
        </div>

        <div className="mt-2 flex justify-between border-t pt-2 text-sm font-bold">
          <span>Total</span>
          <span>{currency(grandTotal)}</span>
        </div>

      </div>

      {/* Footer */}
      <div className="mt-4 border-t border-dashed pt-2 text-center text-[10px] text-slate-500">
        Thank you for shopping!
      </div>

    </div>
  );
}