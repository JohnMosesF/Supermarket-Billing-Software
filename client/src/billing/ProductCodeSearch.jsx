import { useState, useRef, useEffect, useCallback } from 'react';
import { billingAPI } from './billingService.js';
import { Search, X } from 'lucide-react';

export default function ProductCodeSearch({ value, onChange, onSelect, placeholder = 'Product code / SKU / Barcode', autoFocus }) {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  const search = useCallback(async (q) => {
    if (!q) {
      setResults([]);
      setSelectedIndex(-1);
      return;
    }
    setLoading(true);
    try {
      const res = await billingAPI.searchProducts(q, 8);
      setResults(res.data.products || []);
      setSelectedIndex(-1);
    } catch (err) {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (!value) {
      setResults([]);
      setSelectedIndex(-1);
      return;
    }
    debounceRef.current = setTimeout(() => search(value), 120);
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

  return (
    <div className="relative w-full">
      <div className="flex items-center gap-2 rounded border border-slate-300 bg-white px-3 py-2 shadow-sm">
        <Search size={18} className="text-slate-400" />
        <input
          data-pos-code
          ref={inputRef}
          type="text"
          inputMode="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="w-48 md:w-64 lg:w-72 bg-transparent text-lg font-medium outline-none"
        />
        {value && (
          <button type="button" onClick={() => { onChange(''); setResults([]); }} className="p-1 rounded text-slate-500">
            <X size={16} />
          </button>
        )}
      </div>

      {results.length > 0 && (
        <div className="absolute left-0 right-0 z-30 mt-2 overflow-hidden rounded border bg-white shadow-lg">
          {results.map((p, idx) => (
            <button
              key={p._id}
              type="button"
              onClick={() => onSelect(p)}
              className={`w-full px-3 py-2 text-left ${idx === selectedIndex ? 'bg-slate-100' : 'hover:bg-slate-50'}`}
            >
              <div className="flex justify-between">
                <div className="truncate">{p.productName || p.name} <span className="text-xs text-slate-500">· {p.sku || p.barcode}</span></div>
                <div className="font-semibold text-emerald-600">{p.sellingPrice}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
