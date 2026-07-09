import React, { useRef, useEffect } from 'react';
import { currency } from '../utils/format.js';
import { normalizeBillItem } from '../utils/normalizeBillItem.js';

function displayProductName(item, invoiceLanguage) {
  const language = String(invoiceLanguage || '').trim().toLowerCase();
  const useLocal = language === 'local language' || language === 'local';
  return useLocal ? (item.localName || item.productName || '-') : (item.productName || '-');
}

function BillingTable({ cart = [], invoiceLanguage = 'English', onSelectIndex = () => {}, selectedIndex = -1, onUpdateItem = () => {}, onRemove = () => {} }) {
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

  const total = cart.reduce((sum, item) => sum + normalizeBillItem(item).netAmount, 0);

  return (
    <div ref={tableRef} className="text-sm" tabIndex={0}>
      <div className="grid grid-cols-10 gap-1 font-semibold text-xs px-1 pb-1 border-b">
        <div>PID</div>
        <div>SKU</div>
        <div className="col-span-2">Product</div>
        <div className="text-right">Rate</div>
        <div className="text-right">Qty</div>
        <div className="text-center">Unit</div>
        <div className="text-right">GST%</div>
        <div className="text-right">GST</div>
        <div className="text-right">Amount</div>
      </div>

      <div>
        {cart.map((item, i) => {
          const normalized = normalizeBillItem(item);
          return (
            <div key={i} className={`${i === selectedIndex ? 'bg-blue-100 ring-1 ring-blue-200' : ''} grid grid-cols-10 gap-1 items-center text-xs px-1 py-1 border-b cursor-pointer`} onClick={() => onSelectIndex(i)}>
              <div className="truncate">
                
                {normalized.productId || '-'}
                </div>

                <div className="truncate">
                {normalized.sku || '-'}
                </div>

                <div className="col-span-2 font-medium">
                {displayProductName(normalized, invoiceLanguage)}
                </div>

                <div className="text-right">
                {currency(normalized.price)}
                </div>

                <div className="text-right">
                {formatQty(normalized.quantity, normalized.allowDecimalQty)}
                </div>

                <div className="text-center">
                {normalized.unit}
                </div>

                <div className="text-right">
                {normalized.gstRate}
                </div>

                <div className="text-right">
                {currency(normalized.gstAmount)}
                </div>

                <div className="text-right font-semibold">
                {currency(normalized.netAmount)}
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
  if (prev.invoiceLanguage !== next.invoiceLanguage) return false;
  if (prev.selectedIndex !== next.selectedIndex) return false;
  if (prev.cart.length !== next.cart.length) return false;
  // fallback: compare JSON string of cart (acceptable for small carts)
  return JSON.stringify(prev.cart) === JSON.stringify(next.cart);
});
