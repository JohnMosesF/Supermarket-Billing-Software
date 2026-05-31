import { useState, useRef, useEffect } from 'react';
import ProductCodeSearch from './ProductCodeSearch.jsx';
import ProductNameSearch from './ProductNameSearch.jsx';

export default function FastBillingEntry({ onAddProduct, autoFocusCode = false }) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [product, setProduct] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [price, setPrice] = useState('');
  const qtyRef = useRef(null);
  const priceRef = useRef(null);
  const codeRef = useRef(null);

  useEffect(() => {
    if (autoFocusCode) {
      const el = document.querySelector('[data-pos-code]');
      el?.focus();
    }
  }, [autoFocusCode]);

  const clearEntry = () => {
    setCode('');
    setName('');
    setProduct(null);
    setQuantity(1);
    setPrice('');
    const el = document.querySelector('[data-pos-code]');
    el?.focus();
  };

  const handleSelectProduct = (p) => {
    setProduct(p);
    setName(p.productName || p.name || '');
    setCode(p.sku || p.barcode || p._id || '');
    setPrice(p.sellingPrice ?? '');
    setQuantity(1);
    // focus quantity for quick edits
    setTimeout(() => qtyRef.current?.focus(), 50);
  };

  const handleAdd = () => {
    if (!product) return;
    onAddProduct(product, quantity);
    clearEntry();
  };

  const handleCodeEnter = () => {
    // if product is selected, add; otherwise focus name
    if (product) handleAdd();
    else {
      const nameInput = document.querySelector('[data-pos-name]');
      nameInput?.focus();
    }
  };

  const handleNameEnter = () => {
    if (product) handleAdd();
    else {
      const qty = qtyRef.current;
      qty?.focus();
    }
  };

  return (
    <div className="mt-3">
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <ProductCodeSearch
            value={code}
            onChange={(v) => { setCode(v); setProduct(null); }}
            onSelect={(p) => handleSelectProduct(p)}
            autoFocus={autoFocusCode}
          />
        </div>

        <div className="flex-1">
          <ProductNameSearch
            value={name}
            onChange={(v) => { setName(v); setProduct(null); }}
            onSelect={(p) => handleSelectProduct(p)}
          />
        </div>

        <div className="w-28">
          <input
            ref={qtyRef}
            type="number"
            inputMode="numeric"
            min="1"
            value={quantity}
            onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
            className="w-full input text-lg text-center"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAdd();
              if (e.key === '+') setQuantity((q) => q + 1);
              if (e.key === '-') setQuantity((q) => Math.max(1, q - 1));
            }}
          />
        </div>

        <div className="w-40">
          <input
            ref={priceRef}
            type="number"
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="w-full input text-lg text-right"
            onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
          />
        </div>
      </div>
    </div>
  );
}
