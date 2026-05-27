import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, X } from 'lucide-react';

export default function ProductSearch({ onSelect, onAddProduct }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef(null);
  const timeoutRef = useRef(null);

  // Debounced search
  const search = useCallback(async (searchTerm) => {
    if (!searchTerm.trim()) {
      setResults([]);
      setSelectedIndex(-1);
      return;
    }

    setLoading(true);
    try {
      // Search by name, SKU, or barcode
      const res = await fetch(
        `/api/products?search=${encodeURIComponent(searchTerm)}&limit=8`,
        { headers: { 'Authorization': `Bearer ${localStorage.getItem('token') || ''}` } }
      );
      if (res.ok) {
        const data = await res.json();
        setResults(data.products || []);
        setSelectedIndex(-1);
      }
    } catch (err) {
      console.error('Search error:', err);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    clearTimeout(timeoutRef.current);
    if (query.trim()) {
      timeoutRef.current = setTimeout(() => search(query), 300);
    } else {
      setResults([]);
      setSelectedIndex(-1);
    }
    return () => clearTimeout(timeoutRef.current);
  }, [query, search]);

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => (i < results.length - 1 ? i + 1 : i));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => (i > 0 ? i - 1 : -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIndex >= 0 && results[selectedIndex]) {
        handleSelectProduct(results[selectedIndex]);
      }
    } else if (e.key === 'Escape') {
      setResults([]);
      setSelectedIndex(-1);
      setQuery('');
    }
  };

  const handleSelectProduct = (product) => {
    onAddProduct(product);
    setQuery('');
    setResults([]);
    setSelectedIndex(-1);
    inputRef.current?.focus();
  };

  return (
    <div className="relative w-full">
      <div className="relative">
        <div className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
          <Search size={18} className="text-slate-400" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search product (name/SKU/barcode) or press F2"
            className="flex-1 bg-transparent outline-none text-sm"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
          />
          {query && (
            <button
              className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded"
              onClick={() => {
                setQuery('');
                setResults([]);
                setSelectedIndex(-1);
              }}
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Dropdown */}
      {results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg shadow-lg z-10 max-h-64 overflow-y-auto">
          {results.map((product, index) => (
            <button
              key={product._id}
              onClick={() => handleSelectProduct(product)}
              className={`w-full text-left px-4 py-3 border-b border-slate-100 dark:border-slate-800 last:border-0 transition ${
                index === selectedIndex ? 'bg-blue-100 dark:bg-blue-900' : 'hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="font-semibold text-sm">{product.name}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    SKU: {product.sku} {product.barcode ? `| Barcode: ${product.barcode}` : ''}
                  </div>
                </div>
                <div className="text-right ml-2">
                  <div className="font-bold text-green-600 dark:text-green-400">{product.sellingPrice}</div>
                  <div className="text-xs text-slate-500">Stock: {product.stock}</div>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {loading && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg shadow-lg p-3 text-center text-sm text-slate-500">
          Searching...
        </div>
      )}
    </div>
  );
}
