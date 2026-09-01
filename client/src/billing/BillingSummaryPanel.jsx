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
  roundOff = 0,
  total = 0,
  invoiceAt = null,
  onSave = () => {},
  onHold = () => {},
  onPrint = () => {}
}) {
  const summary = useMemo(() => {
    const items = cart.length;
    const pieces = cart.reduce((s, i) => s + parseFloat(i.qty || 0), 0);
    const billAmount = total;
    
    return {
      items,
      pieces,
      subtotal: subtotal || 0,
      totalGst: taxTotal || 0,
      discountAmt: discount || 0,
      roundOffAmt: roundOff || 0,
      billAmount: billAmount || 0
    };
  }, [cart, subtotal, taxTotal, discount, roundOff, total]);

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
          <span className="font-semibold tabular-nums text-right">{summary.items}</span>
        </div>
        <div className="flex justify-between">
          <span>Qty:</span>
          <span className="font-semibold tabular-nums text-right">{summary.pieces}</span>
        </div>
        <div className="flex justify-between border-t pt-2">
          <span>Subtotal:</span>
          <span className="font-semibold tabular-nums text-right">{currency(summary.subtotal)}</span>
        </div>
        <div className="flex justify-between">
          <span>Tax:</span>
          <span className="font-semibold tabular-nums text-right">{currency(summary.totalGst)}</span>
        </div>
        {summary.discountAmt > 0 && (
          <div className="flex justify-between text-orange-600">
            <span>Discount:</span>
            <span className="font-semibold tabular-nums text-right">-{currency(summary.discountAmt)}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span>Round Off:</span>
          <span className={`font-semibold tabular-nums text-right ${summary.roundOffAmt > 0 ? 'text-green-700' : summary.roundOffAmt < 0 ? 'text-red-700' : 'text-slate-700'}`}>
            {summary.roundOffAmt > 0 ? `+${currency(summary.roundOffAmt)}` : currency(summary.roundOffAmt)}
          </span>
        </div>
        <div className="flex justify-between border-t bg-blue-50 p-3 text-xl font-bold rounded">
          <span>Grand Total:</span>
          <span className="text-right tabular-nums text-blue-700">{currency(summary.billAmount)}</span>
        </div>
      </div>
      
    </div>
  );
}
