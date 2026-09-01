import React, { useState, useImperativeHandle, forwardRef, useRef, useEffect } from 'react';
import { api } from '../api/http.js';
import { productAPI } from './billingService.js';
import toast from 'react-hot-toast';
import { currency } from '../utils/format.js';

const parseQuantityInput = (value, allowDecimalQty) => {
  const parsed = Number(String(value ?? '').trim());
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return allowDecimalQty ? parsed : Math.trunc(parsed);
};

const stockTone = (stock) => {
  const value = Number(stock ?? 0);
  if (value <= 0) return 'text-red-600';
  if (value <= 5) return 'text-orange-600';
  return 'text-emerald-600';
};

const highlightMatch = (text, query) => {
  const value = String(text ?? '');
  const needle = String(query || '').trim();
  if (!needle || !value.toLowerCase().startsWith(needle.toLowerCase())) return value;
  return (
    <>
      <mark className="bg-yellow-200 px-0 text-inherit">{value.slice(0, needle.length)}</mark>
      {value.slice(needle.length)}
    </>
  );
};

/**
 * BillingEntryRow - Advanced POS-style product entry with product name search
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
  const BillingEntryRow = forwardRef(function BillingEntryRow({ onAddItem, onFocusCustomer, canEditPrice = true, editingIndex = null, onCancelEdit = () => {} }, ref) {
  
    // Form state
  const [mongoId, setMongoId] = useState(null); // MongoDB ObjectId (_id)
  const [productId, setProductId] = useState(''); // Numeric product ID
  const [name, setName] = useState('');
  const [localName, setLocalName] = useState('');
  const [sku, setSku] = useState('');
  const [rate, setRate] = useState('0');
  const [qty, setQty] = useState('1');
  const [gst, setGst] = useState('0');
  const [retailPrice, setRetailPrice] = useState('0');
  const [wholesalePrice, setWholesalePrice] = useState('0');
  const [mrp, setMrp] = useState('0');
  const [priceMode, setPriceMode] = useState('retail');
  const [itemDiscountPercent, setItemDiscountPercent] = useState('0');
  const [itemDiscountAmount, setItemDiscountAmount] = useState('0');
  const [gstInclusive, setGstInclusive] = useState(false);
  const [hsnCode, setHsnCode] = useState('');
  const [allowNegativeStock, setAllowNegativeStock] = useState(false);
  const [stock, setStock] = useState(null);
  const [unit, setUnit] = useState('pcs');
  const [allowDecimalQty, setAllowDecimalQty] = useState(false);
  
  // Autocomplete state
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);
  const [searchQuery, setSearchQuery] = useState('');
  const [allProducts, setAllProducts] = useState([]);
  
  // Refs for field management
  const productIdRef = useRef(null);
  const nameRef = useRef(null);
  const qtyRef = useRef(null);
  const rateRef = useRef(null);
  const discountRef = useRef(null);
  const gstRef = useRef(null);
  const suggestionRefs = useRef([]);

  const focusQty = (selectValue = false) => {
    setTimeout(() => {
      const input = qtyRef.current;
      if (!input) return;
      input.focus();
      if (selectValue) input.select();
    }, 0);
  };
  
  useEffect(() => {
    if (
      selectedSuggestionIndex >= 0 &&
      suggestionRefs.current[selectedSuggestionIndex]
    ) {
      suggestionRefs.current[
        selectedSuggestionIndex
      ].scrollIntoView({
        block: 'nearest',
        behavior: 'auto'
      });
    }
  }, [selectedSuggestionIndex]);

  // Focus on component mount
  useEffect(() => {
    productIdRef.current?.focus();
  }, []);

  useEffect(() => {
    let cancelled = false;

    productAPI.listProducts(10000)
      .then((res) => {
        if (!cancelled) setAllProducts(res.data?.products || []);
      })
      .catch((err) => {
        console.error('Failed to load billing products', err);
        if (!cancelled) setAllProducts([]);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    api.get('/inventory/settings', { silent: true })
      .then((res) => setAllowNegativeStock(Boolean(res.data?.settings?.allowNegativeStock)))
      .catch(() => setAllowNegativeStock(false));
  }, []);

  useEffect(() => {
    const q = searchQuery.trim();
    if (!q) return;

    const products = productAPI.filterProductsByNamePrefix(allProducts, q, 100);
    setSuggestions(products);
    setShowSuggestions(products.length > 0);
    setSelectedSuggestionIndex(products.length > 0 ? 0 : -1);
  }, [allProducts, searchQuery]);

  /**
   * Clear entire entry row and reset focus to product ID
   */
  const clearRow = () => {
    setMongoId(null);
    setProductId('');
    setSku('');
    setName('');
    setLocalName('');
    setRate('0');
    setRetailPrice('0');
    setWholesalePrice('0');
    setMrp('0');
    setPriceMode('retail');
    setItemDiscountPercent('0');
    setItemDiscountAmount('0');
    setGstInclusive(false);
    setHsnCode('');
    setQty('1');
    setStock(null);
    setUnit('pcs');
    setAllowDecimalQty(false);
    setGst('0');
    setSuggestions([]);
    setShowSuggestions(false);
    setSelectedSuggestionIndex(-1);
    setSearchQuery('');
    productIdRef.current?.focus();
  };

  const cancelEditMode = () => {
    clearRow();
    onCancelEdit();
  };

  const applyProduct = (found) => {
    const nextRetail = Number(found.retailPrice ?? found.sellingPrice ?? 0);
    const nextWholesale = Number(found.wholesalePrice ?? nextRetail);
    const nextMrp = Number(found.mrp ?? nextRetail);
    setMongoId(found._id || null);
    setProductId(String(found.productId || ''));
    setSku(found.sku || '');
    setName(found.productName || found.name || '');
    setLocalName(found.localName || '');
    setRetailPrice(String(nextRetail));
    setWholesalePrice(String(nextWholesale));
    setMrp(String(nextMrp));
    setPriceMode('retail');
    setRate(String(nextRetail));
    setGst(String(found.taxRate ?? found.tax ?? 0));
    setQty('1');
    setStock(found.stock ?? null);
    setUnit(found.unit || 'pcs');
    setAllowDecimalQty(found.allowDecimalQty || false);
    setGstInclusive(Boolean(found.gstInclusive));
    setHsnCode(found.hsnCode || '');
    setSuggestions([]);
    setShowSuggestions(false);
    focusQty(true);
  };

  const loadCartItem = (item) => {
    const nextRetail = Number(item.retailPrice ?? item.rate ?? item.price ?? 0);
    const nextWholesale = Number(item.wholesalePrice ?? nextRetail);
    const nextMrp = Number(item.mrp ?? nextRetail);
    setMongoId(item._id || item.mongoId || null);
    setProductId(String(item.productId || ''));
    setSku(item.sku || '');
    setName(item.productName || item.name || '');
    setLocalName(item.localName || '');
    setRetailPrice(String(nextRetail));
    setWholesalePrice(String(nextWholesale));
    setMrp(String(nextMrp));
    setPriceMode(item.priceMode || 'retail');
    setRate(String(item.rate ?? item.price ?? nextRetail));
    setGst(String(item.gst ?? item.gstRate ?? 0));
    setQty(String(item.qty ?? item.quantity ?? 1));
    setStock(item.stock ?? null);
    setUnit(item.unit || 'pcs');
    setAllowDecimalQty(Boolean(item.allowDecimalQty));
    setGstInclusive(Boolean(item.gstInclusive));
    setHsnCode(item.hsnCode || '');
    setSuggestions([]);
    setShowSuggestions(false);
    setSelectedSuggestionIndex(-1);
    setSearchQuery('');
    focusQty(true);
  };

  // Expose methods to parent via ref
  useImperativeHandle(ref, () => ({
    focusProductId: clearRow,
    focusName: () => {
      setTimeout(() => nameRef.current?.focus(), 0);
    },
    focusQty: () => {
      focusQty(true);
    },
    loadCartItem,
    clearRow
  }));

  /**
   * Fetch product by barcode, SKU, or numeric product ID
   */
  const handleProductIdEnter = async () => {
    const idStr = String(productId || '').trim();
    if (!idStr) {
      // Move to product name field if product ID is empty
      nameRef.current?.focus();
      return;
    }

    try {
      const res = await productAPI.lookupProduct(idStr);
      const found = res.data?.product;
      
      if (found) {
        applyProduct(found);
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
  const handleNameChange = (value) => {
    setName(value);
    setSearchQuery(value);
    setSelectedSuggestionIndex(-1);
    
    const q = String(value).trim();
    if (!q || q.length < 1) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    const products = productAPI.filterProductsByNamePrefix(allProducts, q, 100);
    setSuggestions(products);
    setShowSuggestions(products.length > 0);

    // Auto-select first result
    setSelectedSuggestionIndex(
      products.length > 0 ? 0 : -1
    );
  };

  /**
   * Select a product from suggestions
   * CRITICAL: Preserve MongoDB ObjectId (_id) from product object
   */
  const selectSuggestion = (product) => {

    console.log(
      'Selected product from autocomplete:',
      product,
      'unit=',
      product.unit,
      'allowDecimalQty=',
      product.allowDecimalQty
    );
    applyProduct(product);
    setSuggestions([]);
    setShowSuggestions(false);
    setSelectedSuggestionIndex(-1);
    setSearchQuery('');
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
          focusQty(true);
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
        if (suggestions.length > 0) {
          selectSuggestion(
            suggestions[
              selectedSuggestionIndex >= 0
                ? selectedSuggestionIndex
                : 0
            ]
          );
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
      focusQty(true);
    }
  };

  /**
   * Add or update item in cart
   * CRITICAL: Use MongoDB ObjectId (_id) as productId, NOT product name
   */
  const handleAddItem = () => {
    if (!name && !mongoId) {
      toast.error('Please select a product');
      return;
    }

    if (!mongoId) {
      toast.error('Invalid product: missing ObjectId');
      return;
    }

    const quantity = parseQuantityInput(qty, allowDecimalQty);
    if (quantity <= 0) {
      toast.error('Enter a valid quantity');
      return;
    }
    if (!allowDecimalQty && !Number.isInteger(quantity)) {
      toast.error(`${unit || 'pcs'} accepts whole number quantities only`);
      return;
    }

    const grossAmount = Number(rate || 0) * quantity;
    const percentDiscount = grossAmount * Number(itemDiscountPercent || 0) / 100;
    const discountAmount = Number(itemDiscountAmount || 0) || percentDiscount;
    const afterDiscount = Math.max(grossAmount - discountAmount, 0);
    const gstAmount = gstInclusive
      ? afterDiscount - afterDiscount / (1 + Number(gst || 0) / 100)
      : afterDiscount * Number(gst || 0) / 100;
    const amount = gstInclusive ? afterDiscount - gstAmount : afterDiscount;
    const netAmount = gstInclusive ? afterDiscount : afterDiscount + gstAmount;

    const cartItem = {
      _id: mongoId,

      productId: productId || mongoId,
      sku,

      productName: name,
      name,
      localName,

      qty: quantity,
      quantity,
      unit,
      allowDecimalQty,

      rate: Number(rate || 0),
      priceMode,
      retailPrice: Number(retailPrice || 0),
      wholesalePrice: Number(wholesalePrice || 0),
      mrp: Number(mrp || 0),
      gst: Number(gst || 0),
      gstInclusive,
      hsnCode,
      discount: discountAmount,
      discountPercent: Number(itemDiscountPercent || 0),

      stock,

      taxableAmount: amount,
      amount,
      gstAmount,
      netAmount
    };

    console.log('Adding item to cart with MongoDB ObjectId:', cartItem);
    onAddItem(cartItem);
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
      editingIndex != null ? cancelEditMode() : clearRow();
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

      if (allowDecimalQty) {
        setQty(q => String((parseFloat(q || 0) + 0.25).toFixed(3)));
      } else {
        setQty(q => String(parseInt(q || 0, 10) + 1));
      }
    } else if (e.key === '-') {
      e.preventDefault();

      if (allowDecimalQty) {
        setQty(q => String(Math.max(0.001, parseFloat(q || 0.001) - 0.25).toFixed(3)));
      } else {
        setQty(q => String(Math.max(1, parseInt(q || 1, 10) - 1)));
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      editingIndex != null ? cancelEditMode() : clearRow();
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
        discountRef.current?.focus();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      editingIndex != null ? cancelEditMode() : clearRow();
    }
  };

  /**
   * Keyboard handler for Discount field
   */
  const handleDiscountKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      if (e.shiftKey) {
        rateRef.current?.focus();
      } else {
        gstRef.current?.focus();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      editingIndex != null ? cancelEditMode() : clearRow();
    }
  };

  /**
   * Keyboard handler for GST field
   */
  const handleGstKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      if (e.shiftKey) {
        discountRef.current?.focus();
      } else {
        // Add item and move forward (will focus product ID)
        handleAddItem();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      editingIndex != null ? cancelEditMode() : clearRow();
    }
  };

  // Calculate amounts for display
  const quantity = parseQuantityInput(qty, allowDecimalQty);
  const grossAmount = Number(rate || 0) * quantity;
  const percentDiscount = grossAmount * Number(itemDiscountPercent || 0) / 100;
  const discountAmount = Number(itemDiscountAmount || 0) || percentDiscount;
  const afterDiscount = Math.max(grossAmount - discountAmount, 0);
  const gstAmount = gstInclusive
    ? afterDiscount - afterDiscount / (1 + Number(gst || 0) / 100)
    : afterDiscount * Number(gst || 0) / 100;
  const amount = gstInclusive ? afterDiscount - gstAmount : afterDiscount;
  const netAmount = gstInclusive ? afterDiscount : afterDiscount + gstAmount;

  return (
    <div className="space-y-2">
      {editingIndex != null && (
        <div className="flex items-center justify-between rounded border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700">
          <span>Editing Item #{editingIndex + 1}</span>
          <button type="button" className="rounded px-2 py-1 hover:bg-blue-100" onClick={cancelEditMode}>ESC Cancel</button>
        </div>
      )}
      {/* Header row */}
      <div className="grid grid-cols-12 gap-2 text-xs font-semibold bg-gray-100 p-2 rounded-sm">
        <div className="col-span-1">PID</div>
        <div className="col-span-4">Product Name</div>
        <div className="col-span-1 text-center">Qty</div>
        <div className="col-span-1 text-right">Price</div>
        <div className="col-span-1 text-center">Type</div>
        <div className="col-span-1 text-right">Disc</div>
        <div className="col-span-1 text-right">GST%</div>
        <div className="col-span-1 text-right">Net</div>
      </div>

      {/* Entry row */}
      <div className="grid grid-cols-12 gap-2 items-center text-sm bg-white p-2 rounded-sm border border-gray-200">
        {/* Product ID */}
        <input
          ref={productIdRef}
          type="text"
          className="col-span-1 p-2 border rounded-sm text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
          placeholder="PID/SKU"
          value={productId}
          onChange={(e) => setProductId(e.target.value.trimStart())}
          onKeyDown={handleProductIdKeyDown}
        />

        {/* Product Name with Autocomplete */}
        <div className="col-span-4 relative">
          <input
            ref={nameRef}
            type="text"
            className="w-full p-2 border rounded-sm text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
            placeholder="Product name (or search)"
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            onKeyDown={handleNameKeyDown}
            autoComplete="off"
          />

          {/* Autocomplete Dropdown */}
          {showSuggestions && suggestions.length > 0 && (
            <ul className="fixed z-[9999] mt-1 max-h-72 min-w-[30rem] overflow-y-auto rounded-sm border border-gray-300 bg-white text-xs shadow-2xl" style={{ left: nameRef.current?.getBoundingClientRect().left || 0, top: (nameRef.current?.getBoundingClientRect().bottom || 0) + 4, width: nameRef.current?.getBoundingClientRect().width || undefined }}>
              {suggestions.map((product, idx) => (
                <li
                  ref={(el) => (suggestionRefs.current[idx] = el) }
                  key={idx}
                  className={`cursor-pointer px-3 py-2 ${
                    idx === selectedSuggestionIndex
                      ? 'bg-blue-500 text-white'
                      : 'hover:bg-gray-100'
                  }`}
                  onMouseDown={() => selectSuggestion(product)}
                  onMouseEnter={() => setSelectedSuggestionIndex(idx)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">{highlightMatch(product.productName || product.name, name)}</div>
                      <div className="mt-0.5 text-[11px] opacity-80">
                        {product.productId ? <>PID: {highlightMatch(product.productId, name)} </> : null}
                        {product.sku ? <>SKU: {highlightMatch(product.sku, name)} </> : null}
                        {product.barcode ? <>Barcode: {highlightMatch(product.barcode, name)} </> : null}
                        {product.localName ? <>Tamil: {highlightMatch(product.localName, name)}</> : null}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="font-semibold">{currency(product.sellingPrice || 0)}</div>
                      <div className={`text-[11px] font-semibold ${idx === selectedSuggestionIndex ? 'text-white' : stockTone(product.stock)}`}>Stock : {product.stock ?? 0} {product.unit || 'pcs'}</div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Quantity */}
        <input
          ref={qtyRef}
          type="number"
          min={allowDecimalQty ? "0.001" : "1"}
          step={allowDecimalQty ? "0.001" : "1"}
          className="col-span-1 p-2 border rounded-sm text-xs text-center focus:ring-2 focus:ring-blue-500 focus:outline-none"
          placeholder="1"
          value={qty}
          onChange={(e) => {
            let value = e.target.value;

            if (!allowDecimalQty) {
              value = value.replace(/[^\d.]/g, '').split('.')[0];
            } else {
              value = value.replace(/[^\d.]/g, '');
              const [whole, ...fraction] = value.split('.');
              value = fraction.length ? `${whole}.${fraction.join('')}` : whole;
            }

            setQty(value);
          }}
          onKeyDown={(e) => {
            if (['e', 'E'].includes(e.key) || (!allowDecimalQty && e.key === '.')) {
              e.preventDefault();
              return;
            }

            handleQtyKeyDown(e);
          }}
        />

        {/* Price */}
        <input
          ref={rateRef}
          type="number"
          step="0.01"
          className="col-span-1 p-2 border rounded-sm text-xs text-right focus:ring-2 focus:ring-blue-500 focus:outline-none"
          placeholder="0.00"
          disabled={!canEditPrice}
          value={rate}
          onChange={(e) => setRate(e.target.value.replace(/[^0-9.]/g, ''))}
          onKeyDown={handleRateKeyDown}
        />

        <select
          className="col-span-1 p-2 border rounded-sm text-xs text-center focus:ring-2 focus:ring-blue-500 focus:outline-none"
          value={priceMode}
          disabled={!canEditPrice}
          onChange={(e) => {
            const mode = e.target.value;
            setPriceMode(mode);
            if (mode === 'retail') setRate(retailPrice);
            if (mode === 'wholesale') setRate(wholesalePrice);
            if (mode === 'mrp') setRate(mrp);
          }}
        >
          <option value="retail">Retail</option>
          <option value="wholesale">Wholesale</option>
          <option value="mrp">MRP</option>
          <option value="manual">Manual</option>
        </select>

        <input
          ref={discountRef}
          type="number"
          min="0"
          step="0.01"
          className="col-span-1 p-2 border rounded-sm text-xs text-right focus:ring-2 focus:ring-blue-500 focus:outline-none"
          placeholder="Disc %"
          value={itemDiscountPercent}
          onChange={(e) => {
            setItemDiscountPercent(e.target.value.replace(/[^0-9.]/g, ''));
            setItemDiscountAmount('0');
          }}
          onKeyDown={handleDiscountKeyDown}
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

        {/* Net Amount */}
        <div className="col-span-1 text-right text-xs font-bold pr-2 bg-blue-50 p-1 rounded">
          {currency(netAmount)}
        </div>

        {/* Action Button */}
        <div className="col-span-1 p-2">
          <button
            onClick={handleAddItem}
            className="w-full bg-green-600 text-white rounded-sm text-xs hover:bg-green-700 font-semibold py-2"
            title="Add item to cart"
            disabled={!mongoId || (!allowNegativeStock && ((stock != null && stock <= 0) || (stock != null && Number(qty || 0) > Number(stock))))}
          >
            {editingIndex != null ? 'Update' : 'Add'}
          </button>
        </div>
      </div>

      {mongoId && (
        <div className={`px-2 text-xs font-semibold ${stockTone(stock)}`}>
          Current Stock : {stock ?? 0} {unit || 'pcs'}
          {allowNegativeStock ? <span className="ml-2 text-slate-500">(negative stock allowed)</span> : null}
        </div>
      )}

    </div>
  );
});

export default BillingEntryRow;

