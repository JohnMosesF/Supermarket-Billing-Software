import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, X } from 'lucide-react';
import { productAPI } from './billingService.js';

export default function ProductSearch({ onAddProduct }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef(null);
  const debounceRef = useRef(null);

  const searchProducts = useCallback(async (searchTerm) => {
    if (!searchTerm.trim()) {
      setResults([]);
      setSelectedIndex(-1);
      return;
    }

    setLoading(true);

    try {
      const response = await productAPI.searchProducts(searchTerm, 100);
      const products = (response.data && (response.data.products || response.data)) || [];
      setResults(products || []);
      setSelectedIndex(-1);
    } catch (error) {
      setResults([]);
      console.error('Product search failed:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!inputRef.current) return;
    inputRef.current.focus();
  }, []);

  useEffect(() => {
    clearTimeout(debounceRef.current);

    if (!query.trim()) {
      setResults([]);
      setSelectedIndex(-1);
      return;
    }

    debounceRef.current = window.setTimeout(() => {
      searchProducts(query);
    }, 300);

    return () => clearTimeout(debounceRef.current);
  }, [query, searchProducts]);

  const handleSelectProduct = (product) => {
    onAddProduct(product);
    setQuery('');
    setResults([]);
    setSelectedIndex(-1);
    inputRef.current?.focus();
  };

  const handleKeyDown = (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setSelectedIndex((index) => Math.min(index + 1, results.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setSelectedIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (selectedIndex >= 0 && results[selectedIndex]) {
        handleSelectProduct(results[selectedIndex]);
      } else if (results.length === 1) {
        handleSelectProduct(results[0]);
      }
    } else if (event.key === 'Escape') {
      setQuery('');
      setResults([]);
      setSelectedIndex(-1);
    }
  };

  return (
    <div className="relative w-full">
      <div className="relative">
        <div className="flex items-center gap-2 rounded-2xl border border-slate-300 bg-white px-3 py-2 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <Search size={18} className="text-slate-400" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search product name, SKU or barcode"
            className="flex-1 bg-transparent text-sm outline-none text-slate-900 dark:text-slate-100"
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setResults([]);
                setSelectedIndex(-1);
                inputRef.current?.focus();
              }}
              className="rounded-full p-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {(results.length > 0 || (query.trim() && !loading && results.length === 0)) && (
        <div className="absolute left-0 right-0 z-20 mt-2 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-950">
          {loading ? (
            <div className="p-3 text-center text-sm text-slate-500 dark:text-slate-400">Searching products...</div>
          ) : results.length > 0 ? (
            results.map((product, index) => (
              <button
                key={product._id}
                type="button"
                onClick={() => handleSelectProduct(product)}
                className={`w-full px-4 py-3 text-left transition ${
                  index === selectedIndex
                    ? 'bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-900'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-sm text-slate-900 dark:text-slate-100">{product.productName || product.name}</div>
                    <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {product.productId ? `ID: ${product.productId}` : ''}
                      {product.sku ? ` · SKU: ${product.sku}` : ''}
                      {product.barcode ? ` · Barcode: ${product.barcode}` : ''}
                    </div>
                  </div>
                  <div className="shrink-0 text-right text-sm">
                    <div className="font-semibold text-emerald-600 dark:text-emerald-400">{product.sellingPrice}</div>
                    <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">Stock: {product.stock}</div>
                  </div>
                </div>
              </button>
            ))
          ) : (
            <div className="p-3 text-sm text-slate-500 dark:text-slate-400">No products found for "{query}".</div>
          )}
        </div>
      )}
    </div>
  );
}
