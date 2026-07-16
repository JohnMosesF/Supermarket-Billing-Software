import { useState, useRef, useEffect, useCallback } from 'react';
import { productAPI } from './billingService.js';
import { Search, X } from 'lucide-react';

export default function ProductNameSearch({ value, onChange, onSelect, placeholder = 'Product name', autoFocus }) {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [allProducts, setAllProducts] = useState([]);
  const inputRef = useRef(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  useEffect(() => {
    let cancelled = false;

    productAPI.listProducts(10000)
      .then((res) => {
        if (!cancelled) setAllProducts(res.data?.products || []);
      })
      .catch(() => {
        if (!cancelled) setAllProducts([]);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const listRef = useRef(null);
  const itemRefs = useRef({});

  const search = useCallback((q) => {
    if (!q) {
      setResults([]);
      setSelectedIndex(-1);
      return;
    }
    setLoading(true);
    const products = productAPI.filterProductsByNamePrefix(allProducts, q, 100);
    setResults(products || []);
    setSelectedIndex(-1);
    setLoading(false);
  }, [allProducts]);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (!value) {
      setResults([]);
      setSelectedIndex(-1);
      return;
    }
    debounceRef.current = setTimeout(() => search(value.trim()), 180);
    return () => clearTimeout(debounceRef.current);
  }, [value, search]);

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIndex >= 0 && results[selectedIndex]) onSelect(results[selectedIndex]);
      else if (results.length === 1) onSelect(results[0]);
    } else if (e.key === 'Escape') {
      onChange('');
      setResults([]);
      setSelectedIndex(-1);
    }
  };

  useEffect(() => {
    // scroll selected into view
    if (selectedIndex >= 0 && itemRefs.current[selectedIndex]) {
      try { itemRefs.current[selectedIndex].scrollIntoView({ block: 'nearest' }); } catch (e) {}
    }
  }, [selectedIndex]);

  return (
    <div className="relative w-full">
      <div className="flex items-center gap-2 rounded border border-slate-300 bg-white px-3 py-2 shadow-sm">
        <Search size={18} className="text-slate-400" />
        <input
          data-pos-name
          ref={inputRef}
          type="text"
          inputMode="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="w-64 bg-transparent text-lg font-medium outline-none"
        />
        {value && (
          <button type="button" onClick={() => { onChange(''); setResults([]); }} className="p-1 rounded text-slate-500">
            <X size={16} />
          </button>
        )}
      </div>

      {results.length > 0 && (
        <div ref={listRef} className="absolute left-0 right-0 z-30 mt-2 max-h-64 overflow-auto rounded border bg-white shadow-lg">
          {results.map((p, idx) => (
            <button
              ref={(el) => (itemRefs.current[idx] = el)}
              key={p._id || p.sku || idx}
              type="button"
              onClick={() => onSelect(p)}
              className={`w-full px-3 py-2 text-left ${idx === selectedIndex ? 'bg-slate-100' : 'hover:bg-slate-50'}`}
            >
              <div className="flex justify-between items-center gap-2">
                <div className="truncate">
                  <div className="font-medium">{p.productName || p.name}</div>
                  <div className="text-xs text-slate-500">
                    {p.productId ? `ID: ${p.productId}` : ''}
                    {p.sku ? ` · SKU: ${p.sku}` : ''}
                    {(!p.productId && !p.sku && p.barcode) ? `Barcode: ${p.barcode}` : ''}
                  </div>
                </div>
                <div className="font-semibold text-emerald-600">{p.sellingPrice != null ? p.sellingPrice : ''}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
