import React, { useRef, useEffect } from 'react';
import { currency } from '../utils/format.js';

function BillingTable({ cart = [], onSelectIndex = () => {}, selectedIndex = -1, onUpdateItem = () => {}, onRemove = () => {} }) {
  const tableRef = useRef(null);

  const formatQty = (qty, allowDecimalQty) => {
    const value = parseFloat(qty || 0);
    if (!Number.isFinite(value)) return '0';
    if (!allowDecimalQty && Number.isInteger(value)) return value.toFixed(0);
    return value.toFixed(3).replace(/\.?0+$/, '');
  };

  useEffect(() => {
    const handler = (e) => {
      if (!tableRef.current) return;
      if (!(document.activeElement && tableRef.current.contains(document.activeElement))) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        onSelectIndex((prev) => (typeof prev === 'number' ? Math.min(cart.length - 1, prev + 1) : 0));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        onSelectIndex((prev) => (typeof prev === 'number' ? Math.max(0, prev - 1) : 0));
      } else if (e.key === 'Delete') {
        e.preventDefault();
        if (typeof selectedIndex === 'number' && selectedIndex >= 0) onRemove(selectedIndex);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [cart, onSelectIndex, onRemove, selectedIndex]);

  const total = cart.reduce(
    (s, it) => s + Number(it.rate || 0) * Number(it.qty || 0),
    0
  );

  return (
    <div ref={tableRef} className="text-sm" tabIndex={0}>
      <div className="grid grid-cols-10 gap-1 font-semibold text-xs px-1 pb-1 border-b">
        <div>PID</div>
        <div>SKU</div>
        <div className="col-span-2">Product</div>
        <div className="text-right">Rate</div>
        <div className="text-right">Qty</div>
        <div>Unit</div>
        <div className="text-right">GST%</div>
        <div className="text-right">GST</div>
        <div className="text-right">Amount</div>
      </div>

      <div>
        {cart.map((item, i) => {
          console.log("TABLE ITEM", item);
          const net = Number(item.rate || 0) * parseFloat(item.qty || 0);
          const gstRate = Number(item.gst || 0);
          const amount =
            gstRate > 0
              ? net / (1 + gstRate / 100)
              : net;
          const gstAmt = net - amount;
          const code = item.productId && /^[0-9]+$/.test(String(item.productId))
            ? String(item.productId)
            : (item.sku || '');
          return (
            <div key={i} className={`${i === selectedIndex ? 'bg-blue-100 ring-1 ring-blue-200' : ''} grid grid-cols-10 gap-1 items-center text-xs px-1 py-1 border-b cursor-pointer`} onClick={() => onSelectIndex(i)}>
              <div className="truncate">
                
                {item.productId || '-'}
                </div>

                <div className="truncate">
                {item.sku || '-'}
                </div>

                <div className="col-span-2 truncate font-medium">
                {item.name}
                </div>

                <div className="text-right">
                {currency(Number(item.rate || 0))}
                </div>

                <div className="text-right">
                {formatQty(item.qty, item.allowDecimalQty)}
                </div>

                <div className="text-center">
                {item.unit || 'pcs'}
                </div>

                <div className="text-right">
                {item.gst || 0}
                </div>

                <div className="text-right">
                {currency(gstAmt)}
                </div>

                <div className="text-right font-semibold">
                {currency(net)}
                </div>
            </div>
          );
        })}
      </div>

      <div className="flex justify-end mt-2 text-sm font-medium">Total: {currency(total)}</div>
    </div>
  );
}

export default React.memo(BillingTable, (prev, next) => {
  // shallow compare cart length and selectedIndex to avoid deep comparisons
  if (prev.selectedIndex !== next.selectedIndex) return false;
  if (prev.cart.length !== next.cart.length) return false;
  // fallback: compare JSON string of cart (acceptable for small carts)
  return JSON.stringify(prev.cart) === JSON.stringify(next.cart);
});
