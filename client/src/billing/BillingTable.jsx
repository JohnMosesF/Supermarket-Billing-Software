import React, { useEffect, useRef } from 'react';
import { currency } from '../utils/format.js';
import { normalizeBillItem } from '../utils/normalizeBillItem.js';

function displayProductName(item, invoiceLanguage) {
  const language = String(invoiceLanguage || '').trim().toLowerCase();
  const useLocal = language === 'local language' || language === 'local';
  return useLocal ? (item.localName || item.productName || '-') : (item.productName || '-');
}

function formatQty(qty, allowDecimalQty) {
  const value = parseFloat(qty || 0);
  if (!Number.isFinite(value)) return '0';
  if (!allowDecimalQty && Number.isInteger(value)) return value.toFixed(0);
  return value.toFixed(3).replace(/\.?0+$/, '');
}

function BillingTable({
  cart = [],
  invoiceLanguage = 'English',
  onSelectIndex = () => {},
  selectedIndex = -1,
  onEditItem = () => {},
  onRemove = () => {},
  onClearCart = () => {},
  readOnly = false
}) {
  const tableRef = useRef(null);

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
      } else if (e.key === 'F2') {
        e.preventDefault();
        if (!readOnly && selectedIndex >= 0) onEditItem(selectedIndex);
      } else if (e.key === 'Delete') {
        e.preventDefault();
        if (!readOnly && selectedIndex >= 0) onRemove(selectedIndex);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [cart.length, onEditItem, onRemove, onSelectIndex, readOnly, selectedIndex]);

  const total = cart.reduce((sum, item) => sum + normalizeBillItem(item).netAmount, 0);
  const headerClass = 'sticky top-0 z-10 border-b border-slate-200 bg-slate-100 px-2 py-2 text-xs font-bold text-slate-700';
  const cellClass = 'border-b border-slate-100 px-2 py-1.5 text-xs';
  const numberClass = `${cellClass} text-right tabular-nums`;

  return (
    <div ref={tableRef} className="flex h-full min-h-0 flex-col text-sm outline-none" tabIndex={0}>
      <div className="mb-2 flex items-center justify-between">
        <div className="text-xs font-semibold text-slate-600">{cart.length} cart lines</div>
        <button type="button" onClick={onClearCart} disabled={readOnly || cart.length === 0} className="rounded bg-red-50 px-2 py-1 text-xs font-semibold text-red-700 disabled:opacity-40">
          Clear Cart
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded border border-slate-200">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className={`${headerClass} text-left`}>PID</th>
              <th className={`${headerClass} text-left`}>Product</th>
              <th className={`${headerClass} text-right`}>Rate</th>
              <th className={`${headerClass} text-right`}>Qty</th>
              <th className={`${headerClass} text-right`}>Discount</th>
              <th className={`${headerClass} text-right`}>GST</th>
              <th className={`${headerClass} text-right`}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {cart.map((item, i) => {
              const normalized = normalizeBillItem(item);
              const lineKey = `${normalized.mongoId || normalized.productId || normalized.sku || 'item'}-${i}`;
              const isSelected = i === selectedIndex;
              return (
                <tr
                  key={lineKey}
                  onClick={() => onSelectIndex(i)}
                  onDoubleClick={() => !readOnly && onEditItem(i)}
                  className={`${isSelected ? 'bg-blue-100 ring-1 ring-inset ring-blue-300' : 'hover:bg-slate-50'} cursor-pointer`}
                  title={readOnly ? '' : 'Double-click to edit'}
                >
                  <td className={`${cellClass} max-w-[5rem] truncate font-semibold`}>{normalized.productId || '-'}</td>
                  <td className={`${cellClass} min-w-[14rem]`}>
                    <div className="truncate font-medium">{displayProductName(normalized, invoiceLanguage)}</div>
                    <div className="truncate text-[10px] text-slate-500">
                      {normalized.sku ? `SKU ${normalized.sku} · ` : ''}{normalized.unit || 'pcs'} {normalized.gstInclusive ? 'GST incl.' : 'GST extra'}
                    </div>
                  </td>
                  <td className={numberClass}>{currency(normalized.price)}</td>
                  <td className={numberClass}>{formatQty(normalized.quantity, normalized.allowDecimalQty)}</td>
                  <td className={numberClass}>{normalized.discountPercent ? `${normalized.discountPercent}%` : currency(normalized.discount)}</td>
                  <td className={numberClass}>{currency(normalized.gstAmount)}</td>
                  <td className={`${numberClass} font-bold`}>{currency(normalized.netAmount)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-2 flex justify-end text-sm font-semibold">
        Total: <span className="ml-2 tabular-nums">{currency(total)}</span>
      </div>
    </div>
  );
}

export default React.memo(BillingTable, (prev, next) => {
  if (prev.invoiceLanguage !== next.invoiceLanguage) return false;
  if (prev.selectedIndex !== next.selectedIndex) return false;
  if (prev.cart.length !== next.cart.length) return false;
  return JSON.stringify(prev.cart) === JSON.stringify(next.cart);
});
