import React, { useState, useImperativeHandle, forwardRef, useRef, useEffect } from 'react';
import { api } from '../api/http.js';
import toast from 'react-hot-toast';

/**
 * BillingEntryRow - Advanced POS-style product entry with fuzzy search
 * 
 * WORKFLOW:
 * 1. Product ID (numeric) - auto-focus on load
 * 2. Product Name (search + autocomplete)
 * 3. Quantity
 * 4. Price (auto-filled, editable)
 * 5. GST (auto-filled)
 * 
 * KEYBOARD:
 * - Tab/Enter to navigate forward
 * - Shift+Tab/Shift+Enter to navigate backward
 * - ESC to clear
 * - Arrow Up/Down in dropdown to navigate suggestions
 * - Enter to select suggestion
 */
const BillingEntryRow = forwardRef(function BillingEntryRow({ onAddItem, onFocusCustomer }, ref) {
  // Form state
  const [productId, setProductId] = useState('');
  const [name, setName] = useState('');
  const [rate, setRate] = useState('0');
  const [qty, setQty] = useState('1');
  const [gst, setGst] = useState('0');
  
  // Autocomplete state
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Refs for field management
  const productIdRef = useRef(null);
  const nameRef = useRef(null);
  const qtyRef = useRef(null);
  const rateRef = useRef(null);
  const gstRef = useRef(null);
  
  // Focus on component mount
  useEffect(() => {
    productIdRef.current?.focus();
  }, []);

  // Expose methods to parent via ref
  useImperativeHandle(ref, () => ({
    focusProductId: () => {
      setProductId('');
      setName('');
      setRate('0');
      setQty('1');
      setGst('0');
      setSuggestions([]);
      setShowSuggestions(false);
      setSelectedSuggestionIndex(-1);
      setSearchQuery('');
      setTimeout(() => productIdRef.current?.focus(), 0);
    },
    focusName: () => {
      setTimeout(() => nameRef.current?.focus(), 0);
    },
    focusQty: () => {
      setTimeout(() => qtyRef.current?.focus(), 0);
    }
  }));

  /**
   * Clear entire entry row and reset focus to product ID
   */
  const clearRow = () => {
    setProductId('');
    setName('');
    setRate('0');
    setQty('1');
    setGst('0');
    setSuggestions([]);
    setShowSuggestions(false);
    setSelectedSuggestionIndex(-1);
    setSearchQuery('');
    productIdRef.current?.focus();
  };

  /**
   * Fetch product by numeric ID
   */
  const handleProductIdEnter = async () => {
    const idStr = String(productId || '').trim();
    if (!idStr) {
      // Move to product name field if product ID is empty
      nameRef.current?.focus();
      return;
    }

    try {
      const res = await api.get(`/products/id/${encodeURIComponent(idStr)}`, { silent: true });
      const found = res.data?.product;
      
      if (found) {
        // Fill in product details
        setProductId(String(found.productId || ''));
        setName(found.name || '');
        setRate(String(found.sellingPrice ?? 0));
        setGst(String(found.taxRate ?? 0));
        setQty('1');
        setSuggestions([]);
        setShowSuggestions(false);
        
        // Move to quantity field
        setTimeout(() => qtyRef.current?.focus(), 0);
      } else {
        toast.error('Product not found');
        setProductId('');
      }
    } catch (err) {
      console.error(err);
      toast.error('Error fetching product');
      setProductId('');
    }
  };

  /**
   * Search products by name with autocomplete
   */
  const handleNameChange = async (value) => {
    setName(value);
    setSearchQuery(value);
    setSelectedSuggestionIndex(-1);
    
    const q = String(value).trim();
    if (!q || q.length < 1) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    try {
      const res = await api.get(`/products/search?q=${encodeURIComponent(q)}&limit=8`, { silent: true });
      const products = res.data?.products || [];
      setSuggestions(products);
      setShowSuggestions(products.length > 0);
    } catch (err) {
      console.error(err);
      setSuggestions([]);
      setShowSuggestions(false);
    }
  };

  /**
   * Select a product from suggestions
   */
  const selectSuggestion = (product) => {
    setProductId(String(product.productId || ''));
    setName(product.name || '');
    setRate(String(product.sellingPrice ?? 0));
    setGst(String(product.taxRate ?? 0));
    setQty('1');
    setSuggestions([]);
    setShowSuggestions(false);
    setSelectedSuggestionIndex(-1);
    setSearchQuery('');
    
    // Move to quantity field
    setTimeout(() => qtyRef.current?.focus(), 0);
  };

  /**
   * Navigate suggestions with arrow keys
   */
  const handleNameKeyDown = (e) => {
    if (!showSuggestions || suggestions.length === 0) {
      if (e.key === 'Enter') {
        handleNameEnter();
      } else if (e.key === 'Tab') {
        if (e.shiftKey) {
          e.preventDefault();
          productIdRef.current?.focus();
        } else {
          e.preventDefault();
          qtyRef.current?.focus();
        }
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedSuggestionIndex(prev =>
          prev < suggestions.length - 1 ? prev + 1 : 0
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedSuggestionIndex(prev =>
          prev > 0 ? prev - 1 : suggestions.length - 1
        );
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedSuggestionIndex >= 0) {
          selectSuggestion(suggestions[selectedSuggestionIndex]);
        } else if (suggestions.length === 1) {
          selectSuggestion(suggestions[0]);
        } else {
          handleNameEnter();
        }
        break;
      case 'Escape':
        e.preventDefault();
        setSuggestions([]);
        setShowSuggestions(false);
        break;
      case 'Tab':
        e.preventDefault();
        if (selectedSuggestionIndex >= 0) {
          selectSuggestion(suggestions[selectedSuggestionIndex]);
        } else if (suggestions.length === 1) {
          selectSuggestion(suggestions[0]);
        }
        break;
      default:
        break;
    }
  };

  /**
   * Handle Name field Enter key
   */
  const handleNameEnter = () => {
    if (selectedSuggestionIndex >= 0) {
      selectSuggestion(suggestions[selectedSuggestionIndex]);
    } else if (suggestions.length === 1) {
      selectSuggestion(suggestions[0]);
    } else {
      // Just move to quantity
      setTimeout(() => qtyRef.current?.focus(), 0);
    }
  };

  /**
   * Add or update item in cart
   */
  const handleAddItem = () => {
    if (!name && !productId) {
      toast.error('Please select a product');
      return;
    }

    const amount = Number(rate || 0) * Number(qty || 1);
    const gstAmount = (amount * Number(gst || 0)) / 100;

    onAddItem({
      productId: productId || name,
      name,
      rate: Number(rate || 0),
      qty: Number(qty || 1),
      gst: Number(gst || 0),
      amount,
      gstAmount
    });

    clearRow();
  };

  /**
   * Keyboard handler for Product ID field
   */
  const handleProductIdKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      if (e.shiftKey) {
        // Shift+Tab - go back (no previous field)
        return;
      }
      if (productId.trim()) {
        handleProductIdEnter();
      } else {
        // Move to name field
        nameRef.current?.focus();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      clearRow();
    }
  };

  /**
   * Keyboard handler for Quantity field
   */
  const handleQtyKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      if (e.shiftKey) {
        // Shift+Tab - go back to name
        nameRef.current?.focus();
      } else {
        // Move to rate field
        rateRef.current?.focus();
      }
    } else if (e.key === '+') {
      e.preventDefault();
      setQty(q => String(Number(q || 0) + 1));
    } else if (e.key === '-') {
      e.preventDefault();
      setQty(q => String(Math.max(1, Number(q || 1) - 1)));
    } else if (e.key === 'Escape') {
      e.preventDefault();
      clearRow();
    }
  };

  /**
   * Keyboard handler for Rate field
   */
  const handleRateKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      if (e.shiftKey) {
        // Shift+Tab - go back to qty
        qtyRef.current?.focus();
      } else {
        // Move to GST field
        gstRef.current?.focus();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      clearRow();
    }
  };

  /**
   * Keyboard handler for GST field
   */
  const handleGstKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      if (e.shiftKey) {
        // Shift+Tab - go back to rate
        rateRef.current?.focus();
      } else {
        // Add item and move forward (will focus product ID)
        handleAddItem();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      clearRow();
    }
  };

  // Calculate amounts for display
  const amount = Number(rate || 0) * Number(qty || 1);
  const gstAmount = (amount * Number(gst || 0)) / 100;
  const netAmount = amount + gstAmount;

  return (
    <div className="space-y-2">
      {/* Header row */}
      <div className="grid grid-cols-12 gap-2 text-xs font-semibold bg-gray-100 p-2 rounded-sm">
        <div className="col-span-1">PID</div>
        <div className="col-span-4">Product Name</div>
        <div className="col-span-1 text-center">Qty</div>
        <div className="col-span-1 text-right">Price</div>
        <div className="col-span-1 text-right">GST%</div>
        <div className="col-span-1 text-right">Amt</div>
        <div className="col-span-1 text-right">Net</div>
        <div className="col-span-1"></div>
      </div>

      {/* Entry row */}
      <div className="grid grid-cols-12 gap-2 items-center text-sm bg-white p-2 rounded-sm border border-gray-200">
        {/* Product ID */}
        <input
          ref={productIdRef}
          type="number"
          className="col-span-1 p-2 border rounded-sm text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
          placeholder="ID"
          value={productId}
          onChange={(e) => setProductId(e.target.value.replace(/[^0-9]/g, ''))}
          onKeyDown={handleProductIdKeyDown}
        />

        {/* Product Name with Autocomplete */}
        <div className="col-span-4 relative">
          <input
            ref={nameRef}
            type="text"
            className="w-full p-2 border rounded-sm text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
            placeholder="Product name (or search)"
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            onKeyDown={handleNameKeyDown}
            autoComplete="off"
          />

          {/* Autocomplete Dropdown */}
          {showSuggestions && suggestions.length > 0 && (
            <ul className="absolute z-50 bg-white border border-gray-300 mt-1 max-h-48 overflow-y-auto w-full text-xs rounded-sm shadow-lg">
              {suggestions.map((product, idx) => (
                <li
                  key={idx}
                  className={`p-2 cursor-pointer flex justify-between items-center ${
                    idx === selectedSuggestionIndex
                      ? 'bg-blue-500 text-white'
                      : 'hover:bg-gray-100'
                  }`}
                  onMouseDown={() => selectSuggestion(product)}
                  onMouseEnter={() => setSelectedSuggestionIndex(idx)}
                >
                  <span className="font-semibold">{product.name}</span>
                  <span className="text-xs opacity-70">
                    ID:{product.productId} SKU:{product.sku}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Quantity */}
        <input
          ref={qtyRef}
          type="number"
          className="col-span-1 p-2 border rounded-sm text-xs text-center focus:ring-2 focus:ring-blue-500 focus:outline-none"
          placeholder="1"
          value={qty}
          onChange={(e) => setQty(e.target.value.replace(/[^0-9]/g, ''))}
          onKeyDown={handleQtyKeyDown}
        />

        {/* Price */}
        <input
          ref={rateRef}
          type="number"
          step="0.01"
          className="col-span-1 p-2 border rounded-sm text-xs text-right focus:ring-2 focus:ring-blue-500 focus:outline-none"
          placeholder="0.00"
          value={rate}
          onChange={(e) => setRate(e.target.value.replace(/[^0-9.]/g, ''))}
          onKeyDown={handleRateKeyDown}
        />

        {/* GST */}
        <input
          ref={gstRef}
          type="number"
          step="0.01"
          className="col-span-1 p-2 border rounded-sm text-xs text-center focus:ring-2 focus:ring-blue-500 focus:outline-none"
          placeholder="0"
          value={gst}
          onChange={(e) => setGst(e.target.value.replace(/[^0-9.]/g, ''))}
          onKeyDown={handleGstKeyDown}
        />

        {/* Amount */}
        <div className="col-span-1 text-right text-xs font-semibold pr-2">
          {amount.toFixed(2)}
        </div>

        {/* Net Amount */}
        <div className="col-span-1 text-right text-xs font-bold pr-2 bg-blue-50 p-1 rounded">
          {netAmount.toFixed(2)}
        </div>

        {/* Action Button */}
        <button
          onClick={handleAddItem}
          className="col-span-1 p-2 bg-green-600 text-white rounded-sm text-xs hover:bg-green-700 font-semibold"
          title="Add item to cart"
        >
          Add
        </button>
      </div>

      {/* Quick help */}
      <div className="text-xs text-gray-500 px-2">
        <span className="mr-3">• Enter/Tab: Next field</span>
        <span className="mr-3">• Shift+Tab: Previous field</span>
        <span className="mr-3">• +/-: Adjust qty</span>
        <span>• ESC: Clear</span>
      </div>
    </div>
  );
});

export default BillingEntryRow;
