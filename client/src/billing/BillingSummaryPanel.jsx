import React, { useMemo } from 'react';
import { currency, dateTime } from '../utils/format.js';

/**
 * BillingSummaryPanel - Shows bill summary and totals
 * Accepts pre-calculated totals to avoid recalculation
 */
export default function BillingSummaryPanel({
  cart = [],
  subtotal = 0,
  taxTotal = 0,
  discount = 0,
  total = 0,
  invoiceAt = null,
  onSave = () => {},
  onHold = () => {},
  onPrint = () => {}
}) {
  const summary = useMemo(() => {
    const items = cart.length;
    const pieces = cart.reduce((s, i) => s + Number(i.qty || 0), 0);
    const billAmount = total;
    
    return {
      items,
      pieces,
      subtotal: subtotal || 0,
      totalGst: taxTotal || 0,
      discountAmt: discount || 0,
      billAmount: billAmount || 0
    };
  }, [cart, subtotal, taxTotal, discount, total]);

  return (
    <div className="space-y-3">
      <div className="border-b pb-2">
        <div className="text-sm mb-1">
          <span className="font-semibold">Bill #:</span>
          <span className="ml-2 text-blue-600">AUTO</span>
        </div>
        <div className="text-sm text-gray-600">
          {invoiceAt ? dateTime(invoiceAt) : dateTime(new Date().toISOString())}
        </div>
      </div>

      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span>Items:</span>
          <span className="font-semibold">{summary.items}</span>
        </div>
        <div className="flex justify-between">
          <span>Qty:</span>
          <span className="font-semibold">{summary.pieces}</span>
        </div>
        <div className="flex justify-between border-t pt-2">
          <span>Subtotal:</span>
          <span className="font-semibold">{currency(summary.subtotal)}</span>
        </div>
        <div className="flex justify-between">
          <span>Tax:</span>
          <span className="font-semibold">{currency(summary.totalGst)}</span>
        </div>
        {summary.discountAmt > 0 && (
          <div className="flex justify-between text-orange-600">
            <span>Discount:</span>
            <span className="font-semibold">-{currency(summary.discountAmt)}</span>
          </div>
        )}
        <div className="flex justify-between border-t pt-2 text-lg font-bold bg-blue-50 p-2 rounded">
          <span>Total:</span>
          <span className="text-blue-600">{currency(summary.billAmount)}</span>
        </div>
      </div>

      <div className="space-y-2">
        <button
          onClick={onSave}
          className="w-full py-3 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 transition"
          title="Save Bill (Ctrl+S)"
        >
          💾 Save Bill
        </button>
        
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={onHold}
            className="py-2 bg-yellow-500 text-white font-semibold rounded-lg hover:bg-yellow-600 transition"
            title="Hold Bill (Ctrl+H)"
          >
            ⏸ Hold
          </button>
          <button
            onClick={onPrint}
            className="py-2 bg-slate-600 text-white font-semibold rounded-lg hover:bg-slate-700 transition"
            title="Print Bill (Ctrl+P)"
          >
            🖨 Print
          </button>
        </div>
      </div>
    </div>
  );
}
