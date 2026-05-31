import React, { useRef, useEffect } from 'react';

export default function BillingTable({ cart = [], onSelectIndex = () => {}, selectedIndex = -1, onUpdateItem = () => {}, onRemove = () => {} }) {
  const tableRef = useRef(null);

  useEffect(() => {
    const el = tableRef.current;
    const handler = (e) => {
      if (document.activeElement && tableRef.current && tableRef.current.contains(document.activeElement)) {
        if (e.key === 'ArrowDown') {
          onSelectIndex((prev) => Math.min(cart.length - 1, (typeof prev === 'number' ? prev + 1 : 0)));
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [cart, onSelectIndex]);

  const total = cart.reduce((s, it) => s + (Number(it.rate || 0) * Number(it.qty || 0) + ((Number(it.rate || 0) * Number(it.qty || 0) * Number(it.gst || 0)) / 100)), 0);

  return (
    <div ref={tableRef} className="text-sm">
      <div className="grid grid-cols-8 gap-1 font-semibold text-xs px-1 pb-1 border-b">
        <div>Code</div>
        <div className="col-span-2">Name</div>
        <div className="text-right">Rate</div>
        <div className="text-right">Qty</div>
        <div className="text-right">GST%</div>
        <div className="text-right">GST</div>
        <div className="text-right">Amount</div>
      </div>

      <div>
        {cart.map((item, i) => {
          const amount = Number(item.rate || 0) * Number(item.qty || 0);
          const gstAmt = (amount * Number(item.gst || 0)) / 100;
          const net = amount + gstAmt;
          return (
            <div key={i} className={`${i === selectedIndex ? 'bg-blue-50' : ''} grid grid-cols-8 gap-1 items-center text-xs px-1 py-1 border-b cursor-default`} onClick={() => onSelectIndex(i)}>
              <div className="truncate">{item.sku}</div>
              <div className="col-span-2 truncate">{item.name}</div>
              <div className="text-right">{Number(item.rate || 0).toFixed(2)}</div>
              <div className="text-right">{item.qty}</div>
              <div className="text-right">{item.gst}</div>
              <div className="text-right">{gstAmt.toFixed(2)}</div>
              <div className="text-right">{net.toFixed(2)}</div>
            </div>
          );
        })}
      </div>

      <div className="flex justify-end mt-2 text-sm font-medium">Total: {total.toFixed(2)}</div>
    </div>
  );
}
