import { CheckCircle2, Copy, Eye, FileText, Pencil, Plus, Printer, RefreshCw, Search, Trash2, XCircle } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { createPortal } from 'react-dom';
import { api } from '../api/http.js';
import { ConfirmDialog, TextInputDialog } from '../components/AppDialog.jsx';
import { PageHeader } from '../components/PageHeader.jsx';
import { currency, dateTime } from '../utils/format.js';

const blankRow = {
  pid: '',
  product: '',
  productName: '',
  localName: '',
  sku: '',
  barcode: '',
  batchNo: '',
  expiryDate: '',
  quantity: 1,
  freeQuantity: 0,
  unit: 'pcs',
  allowDecimalQty: false,
  costPrice: 0,
  gstRate: 0,
  gstInclusive: false,
  discountPercent: 0,
  discountAmount: 0,
  mrp: 0,
  wholesalePrice: 0,
  retailPrice: 0,
  sellingPrice: 0
};

const statusLabels = {
  draft: 'Draft',
  ordered: 'Ordered',
  pending: 'Ordered',
  partially_received: 'Partially Received',
  completed: 'Completed',
  cancelled: 'Cancelled'
};

const poStatusOptions = ['draft', 'ordered', 'partially_received', 'completed', 'cancelled'];

const blankProductForm = {
  name: '',
  localName: '',
  category: '',
  unit: 'pcs',
  taxRate: 0,
  barcode: '',
  sku: '',
  purchasePrice: 0,
  sellingPrice: 0,
  stock: ''
};

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function moneyRound(value) {
  return Math.round(number(value) * 100) / 100;
}

function autoRoundOff(preRoundTotal) {
  return moneyRound(Math.round(moneyRound(preRoundTotal)) - moneyRound(preRoundTotal));
}

function hasStoredRoundOff(purchase) {
  return Object.prototype.hasOwnProperty.call(purchase || {}, 'roundOff') && purchase.roundOff !== undefined && purchase.roundOff !== null;
}

function roundOffModeForPurchase(purchase) {
  if (purchase?.roundOffMode === 'auto' || purchase?.roundOffMode === 'manual') return purchase.roundOffMode;
  return hasStoredRoundOff(purchase) && moneyRound(purchase.roundOff) !== 0 ? 'manual' : 'auto';
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function datePresetRange(preset) {
  const now = new Date();
  const start = new Date(now);
  const end = new Date(now);
  if (preset === 'yesterday') {
    start.setDate(now.getDate() - 1);
    end.setDate(now.getDate() - 1);
  } else if (preset === 'week') {
    start.setDate(now.getDate() - now.getDay());
  } else if (preset === 'previousMonth') {
    start.setMonth(now.getMonth() - 1, 1);
    end.setDate(0);
  } else if (preset === 'year') {
    start.setMonth(0, 1);
  } else if (preset === 'today') {
    return { from: today(), to: today(), preset };
  } else {
    start.setDate(1);
  }
  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10), preset };
}

function hasExplicitDiscountAmount(row) {
  return row.discountAmount !== '' && row.discountAmount !== undefined && row.discountAmount !== null;
}

function calculatePurchaseLine(row) {
  const quantity = Math.max(number(row.quantity), 0);
  const freeQuantity = Math.max(number(row.freeQuantity), 0);
  const costPrice = Math.max(number(row.costPrice), 0);
  const gstRate = Math.max(number(row.gstRate), 0);
  const grossAmount = moneyRound(quantity * costPrice);
  const percentDiscount = grossAmount * Math.max(number(row.discountPercent), 0) / 100;
  const discountAmount = moneyRound(Math.min(
    hasExplicitDiscountAmount(row) ? number(row.discountAmount) : percentDiscount,
    grossAmount
  ));
  const discountedAmount = moneyRound(Math.max(grossAmount - discountAmount, 0));
  const gstInclusive = Boolean(row.gstInclusive);
  const gstAmount = moneyRound(gstInclusive && gstRate > 0
    ? discountedAmount - discountedAmount / (1 + gstRate / 100)
    : discountedAmount * gstRate / 100);
  const taxableAmount = moneyRound(gstInclusive ? discountedAmount - gstAmount : discountedAmount);
  const lineTotal = moneyRound(gstInclusive ? discountedAmount : taxableAmount + gstAmount);
  const cgst = moneyRound(gstAmount / 2);
  const sgst = moneyRound(gstAmount - cgst);

  return {
    quantity,
    freeQuantity,
    costPrice,
    gstRate,
    gstInclusive,
    grossAmount,
    discountAmount,
    taxableAmount,
    gstAmount,
    cgst,
    sgst,
    igst: 0,
    lineTotal,
    netAmount: lineTotal
  };
}

function calculatePurchaseTotals(rows, form = {}) {
  const lines = rows.map(calculatePurchaseLine);
  const lineTotalSum = moneyRound(lines.reduce((sum, line) => sum + line.lineTotal, 0));
  const freightCharges = moneyRound(form.freightCharges || 0);
  const discount = moneyRound(lines.reduce((sum, line) => sum + line.discountAmount, 0));
  const gstTotal = moneyRound(lines.reduce((sum, line) => sum + line.gstAmount, 0));
  const taxableAmount = moneyRound(lines.reduce((sum, line) => sum + line.taxableAmount, 0));
  const subTotal = moneyRound(taxableAmount + discount);
  const preRoundTotal = moneyRound(lineTotalSum + freightCharges);
  const manualRoundOff = moneyRound(form.roundOff || 0);
  const roundOffMode = form.roundOffMode === 'manual' ? 'manual' : 'auto';
  const roundOff = roundOffMode === 'manual' ? manualRoundOff : autoRoundOff(preRoundTotal);
  const grandTotal = moneyRound(Math.max(preRoundTotal + roundOff, 0));
  const paidAmount = moneyRound(Math.min(number(form.paidAmount), grandTotal));

  return {
    lines,
    items: rows.filter((row) => row.product).length,
    quantity: lines.reduce((sum, line) => sum + line.quantity + line.freeQuantity, 0),
    subTotal,
    taxableAmount,
    gstTotal,
    discount,
    freightCharges,
    preRoundTotal,
    roundOff,
    roundOffMode,
    total: grandTotal,
    balance: moneyRound(Math.max(grandTotal - paidAmount, 0))
  };
}

function lineTotal(row) {
  return calculatePurchaseLine(row).lineTotal;
}

function productLabel(product) {
  if (!product) return '';
  return `${product.productId ? `${product.productId} - ` : ''}${product.name || product.productName || ''}`;
}

function productSearchText(product) {
  return [
    product?.productId,
    product?.name,
    product?.productName,
    product?.localName,
    product?.sku,
    product?.barcode
  ].map((value) => String(value ?? '').trim().toLowerCase()).join(' ');
}

function productMatches(product, query) {
  const needle = String(query || '').trim().toLowerCase();
  if (!needle) return true;
  return productSearchText(product).includes(needle);
}

function dedupeProducts(list) {
  const seen = new Set();
  return list.filter((product) => {
    const key = String(product?._id || product?.productId || product?.sku || product?.barcode || '').trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function defaultProductHighlight(products) {
  return products.length > 0 ? 1 : 0;
}

function isMeaningfulRow(row) {
  return Boolean(
    row.product ||
    row.pid ||
    row.productName ||
    row.batchNo ||
    row.expiryDate ||
    number(row.quantity, 1) !== 1 ||
    number(row.freeQuantity) > 0 ||
    number(row.costPrice) > 0 ||
    number(row.gstRate) > 0 ||
    number(row.discountPercent) > 0 ||
    number(row.discountAmount) > 0 ||
    number(row.mrp) > 0 ||
    number(row.wholesalePrice) > 0 ||
    number(row.retailPrice) > 0 ||
    number(row.sellingPrice) > 0
  );
}

function SupplierCombobox({ value, suppliers, loading, onChange }) {
  const selectedSupplier = suppliers.find((supplier) => supplier._id === value);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const wrapperRef = useRef(null);

  const supplierLabel = selectedSupplier ? `${selectedSupplier.supplierId ? `${selectedSupplier.supplierId} - ` : ''}${selectedSupplier.name}` : '';
  const visibleSuppliers = results.slice(0, 25);

  function searchSuppliers(term) {
    const needle = String(term || '').trim().toLowerCase();
    const matches = suppliers.filter((supplier) => {
      if (!needle) return true;
      return [
        supplier.supplierId,
        supplier.name,
        supplier.mobile,
        supplier.gstNumber,
        supplier.panNumber
      ].some((item) => String(item || '').toLowerCase().includes(needle));
    });
    setResults(matches.slice(0, 25));
    setHighlightIndex(matches.length ? 0 : -1);
  }

  function openMenu(term = '') {
    setOpen(true);
    searchSuppliers(term);
  }

  function closeMenu() {
    setOpen(false);
    setQuery('');
    setHighlightIndex(0);
  }

  function selectSupplier(supplier) {
    if (!supplier?._id) return;
    onChange(supplier._id);
    closeMenu();
  }

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (wrapperRef.current?.contains(event.target)) return;
      closeMenu();
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  return (
    <div ref={wrapperRef} className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
      <input
        className="input pl-9 pr-7"
        value={open ? query : supplierLabel}
        placeholder={loading ? 'Loading suppliers...' : 'Search supplier'}
        disabled={loading}
        onFocus={() => openMenu('')}
        onClick={() => openMenu(query)}
        onChange={(event) => {
          setQuery(event.target.value);
          if (!open) setOpen(true);
          searchSuppliers(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            if (!open) openMenu(query);
            setHighlightIndex((current) => Math.min(current + 1, visibleSuppliers.length - 1));
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setHighlightIndex((current) => Math.max(current - 1, 0));
          } else if (event.key === 'Enter') {
            event.preventDefault();
            if (visibleSuppliers[highlightIndex]) selectSupplier(visibleSuppliers[highlightIndex]);
          } else if (event.key === 'Escape') {
            event.preventDefault();
            closeMenu();
          } else if (event.key === 'Tab') {
            closeMenu();
          }
        }}
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">v</span>
      {open ? (
        <div className="absolute left-0 right-0 z-40 mt-1 max-h-72 overflow-auto rounded-md border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-950">
          {visibleSuppliers.length ? visibleSuppliers.map((supplier, index) => (
            <button
              key={supplier._id}
              type="button"
              className={`w-full px-3 py-2 text-left text-sm ${index === highlightIndex ? 'bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100' : 'hover:bg-slate-50 dark:hover:bg-slate-900'}`}
              onMouseEnter={() => setHighlightIndex(index)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => selectSupplier(supplier)}
            >
              <div className="font-medium">{supplier.supplierId ? `${supplier.supplierId} - ` : ''}{supplier.name}</div>
              <div className="text-xs text-slate-500">{[supplier.mobile, supplier.gstNumber, supplier.panNumber].filter(Boolean).join(' | ')}</div>
            </button>
          )) : (
            <div className="px-3 py-2 text-sm text-slate-500">No matching suppliers</div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function PurchaseProductCombobox({
  row,
  products,
  formKey,
  index,
  onProduct,
  onSelectedProduct,
  onFocusNext
}) {
  const selectedProduct = products.find((item) => item._id === row.product);
  const selectedLabel = selectedProduct ? productLabel(selectedProduct) : row.productName ? `${row.pid ? `${row.pid} - ` : ''}${row.productName}` : '';
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [menuStyle, setMenuStyle] = useState({});
  const inputRef = useRef(null);
  const menuRef = useRef(null);
  const debounceRef = useRef(null);

  const visibleProducts = results.slice(0, 25);
  const optionCount = visibleProducts.length + 1;

  function updateMenuPosition() {
    const rect = inputRef.current?.getBoundingClientRect();
    if (!rect) return;
    const menuHeight = Math.min(320, 48 + optionCount * 44);
    const spaceBelow = window.innerHeight - rect.bottom - 8;
    const openUp = spaceBelow < menuHeight && rect.top > spaceBelow;
    setMenuStyle({
      position: 'fixed',
      left: `${rect.left}px`,
      top: openUp ? `${Math.max(8, rect.top - menuHeight - 4)}px` : `${rect.bottom + 4}px`,
      width: `${rect.width}px`,
      maxHeight: `${Math.max(120, Math.min(menuHeight, openUp ? rect.top - 12 : spaceBelow))}px`,
      zIndex: 80
    });
  }

  function initialResults() {
    return products.slice(0, 25);
  }

  function openMenu(nextQuery = query) {
    const trimmed = String(nextQuery || '').trim();
    const nextResults = trimmed ? products.filter((product) => productMatches(product, trimmed)).slice(0, 25) : initialResults();
    setOpen(true);
    setResults(nextResults);
    setHighlightIndex(defaultProductHighlight(nextResults));
    window.setTimeout(updateMenuPosition, 0);
  }

  function closeMenu() {
    setOpen(false);
    setQuery('');
    setHighlightIndex(0);
  }

  function selectProduct(product) {
    if (!product?._id) return;
    onSelectedProduct?.(product);
    onProduct(index, product);
    closeMenu();
    onFocusNext?.();
  }

  async function searchProducts(value) {
    const trimmed = String(value || '').trim();
    if (!trimmed) {
      const nextResults = initialResults();
      setResults(nextResults);
      setHighlightIndex(defaultProductHighlight(nextResults));
      return;
    }

    const localMatches = products.filter((product) => productMatches(product, trimmed));
    try {
      const { data } = await api.get('/products/search', { params: { q: trimmed, limit: 25 }, silent: true });
      const remoteMatches = data.products || [];
      const nextResults = dedupeProducts([...remoteMatches, ...localMatches]).slice(0, 25);
      setResults(nextResults);
      setHighlightIndex(defaultProductHighlight(nextResults));
    } catch {
      const nextResults = localMatches.slice(0, 25);
      setResults(nextResults);
      setHighlightIndex(defaultProductHighlight(nextResults));
    }
  }

  useEffect(() => {
    if (!open) return undefined;
    updateMenuPosition();
    const onPointerDown = (event) => {
      if (inputRef.current?.contains(event.target) || menuRef.current?.contains(event.target)) return;
      closeMenu();
    };
    window.addEventListener('resize', updateMenuPosition);
    window.addEventListener('scroll', updateMenuPosition, true);
    document.addEventListener('mousedown', onPointerDown);
    return () => {
      window.removeEventListener('resize', updateMenuPosition);
      window.removeEventListener('scroll', updateMenuPosition, true);
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [open, optionCount]);

  useEffect(() => {
    if (!open) return undefined;
    clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => searchProducts(query), 120);
    return () => clearTimeout(debounceRef.current);
  }, [query, open, products]);

  const chooseHighlighted = () => {
    if (highlightIndex === 0) {
      onProduct(index, '__new__');
      closeMenu();
      return;
    }
    const product = visibleProducts[highlightIndex - 1];
    if (product) selectProduct(product);
  };

  const menu = open ? (
    <div
      ref={menuRef}
      style={menuStyle}
      className="overflow-auto rounded-md border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-950"
    >
      <button
        type="button"
        className={`w-full px-3 py-2 text-left text-sm font-semibold ${highlightIndex === 0 ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200' : 'text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-900/20'}`}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          onProduct(index, '__new__');
          closeMenu();
        }}
      >
        + Add New Product
      </button>
      {visibleProducts.length ? visibleProducts.map((product, productIndex) => {
        const optionIndex = productIndex + 1;
        return (
          <button
            key={product._id}
            type="button"
            className={`w-full px-3 py-2 text-left text-sm ${highlightIndex === optionIndex ? 'bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100' : 'hover:bg-slate-50 dark:hover:bg-slate-900'}`}
            onMouseEnter={() => setHighlightIndex(optionIndex)}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => selectProduct(product)}
          >
            <div className="truncate font-medium">{productLabel(product)}</div>
            <div className="truncate text-xs text-slate-500 dark:text-slate-400">
              {product.sku ? `SKU ${product.sku}` : ''}
              {product.barcode ? `${product.sku ? ' | ' : ''}Barcode ${product.barcode}` : ''}
              {product.localName ? `${product.sku || product.barcode ? ' | ' : ''}${product.localName}` : ''}
            </div>
          </button>
        );
      }) : (
        <div className="px-3 py-2 text-sm text-slate-500">No matching products</div>
      )}
    </div>
  ) : null;

  return (
    <>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
        <input
          ref={inputRef}
          className="input pl-9 pr-7"
          data-row-key={`${formKey}-${index}`}
          data-field="product"
          value={open ? query : selectedLabel}
          placeholder="Search product name..."
          onFocus={() => openMenu('')}
          onClick={() => openMenu(query)}
          onChange={(event) => {
            setQuery(event.target.value);
            if (!open) openMenu(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              if (!open) openMenu(query);
              setHighlightIndex((current) => Math.min(current + 1, optionCount - 1));
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              setHighlightIndex((current) => Math.max(current - 1, 0));
            } else if (event.key === 'Enter') {
              event.preventDefault();
              if (!open) openMenu(query);
              else chooseHighlighted();
            } else if (event.key === 'Escape') {
              event.preventDefault();
              closeMenu();
            } else if (event.key === 'Tab') {
              closeMenu();
            }
          }}
          required
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">v</span>
      </div>
      {menu ? createPortal(menu, document.body) : null}
    </>
  );
}

function PrintButton({ onClick, title = 'Print' }) {
  return (
    <button type="button" className="btn-muted h-9 w-9 p-0" onClick={onClick} title={title}>
      <Printer size={15} />
    </button>
  );
}

export function Purchases() {
  const [activeTab, setActiveTab] = useState('purchase');
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [units, setUnits] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [purchaseSearch, setPurchaseSearch] = useState('');
  const [purchaseFilters, setPurchaseFilters] = useState({ from: '', to: '', paymentStatus: '', supplier: '' });
  const [editingPurchase, setEditingPurchase] = useState(null);
  const [viewPurchase, setViewPurchase] = useState(null);
  const [deletePurchaseTarget, setDeletePurchaseTarget] = useState(null);
  const [rowRemoveTarget, setRowRemoveTarget] = useState(null);
  const [deletingPurchase, setDeletingPurchase] = useState(false);
  const [loadingInitial, setLoadingInitial] = useState(false);
  const [loadingPurchases, setLoadingPurchases] = useState(false);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [savingPurchase, setSavingPurchase] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);
  const [printingId, setPrintingId] = useState('');
  const [activeRowKey, setActiveRowKey] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [priceContext, setPriceContext] = useState({});
  const [poSearch, setPoSearch] = useState('');
  const [poStatus, setPoStatus] = useState('');
  const [poDateFilter, setPoDateFilter] = useState(() => datePresetRange('month'));
  const [editingOrder, setEditingOrder] = useState(null);
  const [viewOrder, setViewOrder] = useState(null);
  const [receiveTarget, setReceiveTarget] = useState(null);
  const [receiveRows, setReceiveRows] = useState([]);
  const [receivingOrder, setReceivingOrder] = useState(false);
  const [newProductTarget, setNewProductTarget] = useState(null);
  const [newProductForm, setNewProductForm] = useState({ ...blankProductForm });
  const [savingProduct, setSavingProduct] = useState(false);
  const [convertTarget, setConvertTarget] = useState(null);
  const [convertInvoiceNumber, setConvertInvoiceNumber] = useState('');
  const [convertError, setConvertError] = useState('');
  const [convertingOrder, setConvertingOrder] = useState(false);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelError, setCancelError] = useState('');
  const [cancellingOrder, setCancellingOrder] = useState(false);
  const [purchaseForm, setPurchaseForm] = useState({
    purchaseNo: '',
    supplier: '',
    invoiceNumber: '',
    supplierInvoice: '',
    purchaseDate: new Date().toISOString().slice(0, 10),
    expectedDeliveryDate: '',
    paymentStatus: 'Unpaid',
    remarks: '',
    freightCharges: 0,
    roundOff: 0,
    roundOffMode: 'auto',
    paidAmount: 0,
    sourcePurchaseOrder: '',
    rows: [{ ...blankRow }]
  });
  const [poForm, setPoForm] = useState({
    poNumber: 'Auto generated',
    supplier: '',
    orderDate: new Date().toISOString().slice(0, 10),
    expectedDate: '',
    status: 'draft',
    referenceNumber: '',
    roundOff: 0,
    roundOffMode: 'auto',
    notes: '',
    rows: [{ ...blankRow }]
  });

  async function load() {
    setLoadingInitial(true);
    try {
    const [supplierRes, productRes, categoryRes, unitRes, purchaseRes, poRes] = await Promise.all([
      api.get('/suppliers', { params: { limit: 1000 } }),
      api.get('/products', { params: { limit: 30 } }),
      api.get('/categories'),
      api.get('/units'),
      api.get('/purchases'),
      api.get('/purchase-orders')
    ]);
    setSuppliers(supplierRes.data.suppliers || []);
    setProducts(productRes.data.products || []);
    setCategories(categoryRes.data.categories || []);
    setUnits(unitRes.data.units || []);
    setPurchases(purchaseRes.data.purchases || []);
    setPurchaseOrders(poRes.data.purchaseOrders || []);
    } finally {
      setLoadingInitial(false);
    }
  }

  useEffect(() => {
    load().catch(() => toast.error('Failed to load purchases'));
  }, []);

  useEffect(() => {
    if (activeTab !== 'orders') return undefined;
    const timer = window.setTimeout(() => {
      loadPurchaseOrders().catch(() => toast.error('Failed to load purchase orders'));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [activeTab, poSearch, poStatus, poDateFilter.from, poDateFilter.to]);

  async function loadPurchaseOrders() {
    setLoadingOrders(true);
    try {
      const { data } = await api.get('/purchase-orders', {
        params: {
          search: poSearch || undefined,
          status: poStatus || undefined,
          from: poDateFilter.from || undefined,
          to: poDateFilter.to || undefined
        }
      });
      setPurchaseOrders(data.purchaseOrders || []);
    } finally {
      setLoadingOrders(false);
    }
  }

  async function loadPurchases() {
    setLoadingPurchases(true);
    try {
      const { data } = await api.get('/purchases', {
        params: {
          search: purchaseSearch || undefined,
          from: purchaseFilters.from || undefined,
          to: purchaseFilters.to || undefined,
          paymentStatus: purchaseFilters.paymentStatus || undefined,
          supplier: purchaseFilters.supplier || undefined
        }
      });
      setPurchases(data.purchases || []);
    } finally {
      setLoadingPurchases(false);
    }
  }

  function productPatch(product) {
    return {
      pid: product?.productId ? String(product.productId) : '',
      product: product?._id || '',
      productName: product?.name || product?.productName || '',
      localName: product?.localName || '',
      sku: product?.sku || '',
      barcode: product?.barcode || '',
      unit: product?.unit || 'pcs',
      allowDecimalQty: Boolean(product?.allowDecimalQty),
      costPrice: product?.purchasePrice || 0,
      gstRate: product?.taxRate || 0,
      gstInclusive: Boolean(product?.gstInclusive),
      mrp: product?.mrp || 0,
      wholesalePrice: product?.wholesalePrice || 0,
      retailPrice: product?.retailPrice ?? product?.sellingPrice ?? 0,
      sellingPrice: product?.sellingPrice || 0
    };
  }

  function applyProduct(row, productOrId) {
    const product = typeof productOrId === 'object' && productOrId ? productOrId : products.find((item) => item._id === productOrId);
    return {
      ...row,
      ...productPatch(product)
    };
  }

  function rememberProduct(product) {
    if (!product?._id) return;
    setProducts((current) => current.some((item) => item._id === product._id) ? current : [product, ...current].slice(0, 60));
  }

  async function selectPurchaseProduct(index, productOrId) {
    if (productOrId === '__new__') {
      setNewProductTarget({ form: 'purchase', index });
      setNewProductForm({ ...blankProductForm, unit: units[0]?.name || 'pcs' });
      return;
    }
    const productId = typeof productOrId === 'object' && productOrId ? productOrId._id : productOrId;
    if (typeof productOrId === 'object') rememberProduct(productOrId);
    setPurchaseForm((current) => ({
      ...current,
      rows: current.rows.map((row, rowIndex) => rowIndex === index ? applyProduct(row, productOrId) : row)
    }));
    if (!productId) return;
    const { data } = await api.get('/purchases/price-history', { params: { product: productId } });
    setPriceContext((current) => ({ ...current, [productId]: data }));
  }

  function selectPoProduct(index, productOrId) {
    if (productOrId === '__new__') {
      setNewProductTarget({ form: 'po', index });
      setNewProductForm({ ...blankProductForm, unit: units[0]?.name || 'pcs' });
      return;
    }
    const product = typeof productOrId === 'object' && productOrId ? productOrId : products.find((item) => item._id === productOrId);
    if (product) rememberProduct(product);
    setPoForm((current) => ({
      ...current,
      rows: (() => {
        const duplicateIndex = current.rows.findIndex((row, rowIndex) => rowIndex !== index && row.product && row.product === product?._id);
        if (duplicateIndex >= 0) {
          const sourceQty = number(current.rows[index]?.quantity, 1);
          const sourceFreeQty = number(current.rows[index]?.freeQuantity, 0);
          const rows = current.rows
            .map((row, rowIndex) => rowIndex === duplicateIndex
              ? { ...row, quantity: number(row.quantity) + sourceQty, freeQuantity: number(row.freeQuantity) + sourceFreeQty }
              : row)
            .filter((_, rowIndex) => rowIndex !== index);
          toast.success('Merged duplicate product into the existing PO row');
          return rows.length ? rows : [{ ...blankRow }];
        }
        return current.rows.map((row, rowIndex) => rowIndex === index ? applyProduct(row, product) : row);
      })()
    }));
  }

  function updatePurchaseRow(index, patch) {
    setPurchaseForm((current) => ({
      ...current,
      rows: current.rows.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row)
    }));
  }

  function updatePoRow(index, patch) {
    setPoForm((current) => ({
      ...current,
      rows: current.rows.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row)
    }));
  }

  function removeRow(setter, index) {
    setter((current) => {
      const rows = current.rows.filter((_, rowIndex) => rowIndex !== index);
      return { ...current, rows: rows.length ? rows : [{ ...blankRow }] };
    });
  }

  function addPurchaseRow() {
    setPurchaseForm((current) => {
      const nextIndex = current.rows.length;
      setTimeout(() => focusRowField('purchase', nextIndex, 'pid'), 0);
      return { ...current, rows: [...current.rows, { ...blankRow }] };
    });
  }

  function focusRowField(form, index, field) {
    setTimeout(() => {
      document.querySelector(`[data-row-key="${form}-${index}"][data-field="${field}"]`)?.focus();
    }, 0);
  }

  function findProductByPid(pid) {
    const value = String(pid || '').trim();
    if (!value) return null;
    return products.find((product) => String(product.productId || '') === value) || null;
  }

  function handlePidChange(form, index, value, onProduct, onUpdate) {
    const pid = value.replace(/[^0-9]/g, '');
    const product = findProductByPid(pid);
    if (product) {
      onProduct(index, product);
    } else {
      onUpdate(index, { pid, product: '', productName: '', localName: '', sku: '', barcode: '' });
    }
  }

  async function handlePidKeyDown(event, form, index, row, onProduct) {
    if (event.key !== 'Enter' && event.key !== 'Tab') return;
    event.preventDefault();
    const pid = String(row.pid || '').trim();
    if (!pid) {
      focusRowField(form, index, 'product');
      return;
    }

    let product = findProductByPid(pid);
    if (!product) {
      try {
        const { data } = await api.get(`/products/id/${encodeURIComponent(pid)}`, { silent: true });
        product = data.product;
        if (product?._id) {
          setProducts((current) => current.some((item) => item._id === product._id) ? current : [product, ...current]);
        }
      } catch {
        product = null;
      }
    }

    if (!product?._id) {
      toast.error('Product ID not found');
      return;
    }

    await onProduct(index, product);
    focusRowField(form, index, 'quantity');
  }

  function handleProductKeyDown(event, form, index) {
    if (event.key !== 'Enter' && event.key !== 'Tab') return;
    event.preventDefault();
    focusRowField(form, index, 'quantity');
  }

  function handleEntryKeyDown(event, form, index, nextField) {
    if (event.key === 'Enter') {
      event.preventDefault();
      focusRowField(form, index, nextField);
    } else if (event.key === 'Escape') {
      event.currentTarget.blur();
    }
  }

  function clearFieldError(key) {
    setFieldErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  function validateRows(rows, formKey = 'purchase') {
    const errors = {};
    const seenProducts = new Map();
    rows.forEach((row, index) => {
      const prefix = `${formKey}.${index}`;
      if (!row.product) errors[`${prefix}.product`] = 'Select a product.';
      const quantity = Number(row.quantity);
      const freeQuantity = Number(row.freeQuantity || 0);
      const costPrice = Number(row.costPrice);
      const gstRate = Number(row.gstRate || 0);
      const discountPercent = Number(row.discountPercent || 0);
      if (!Number.isFinite(quantity) || quantity <= 0) errors[`${prefix}.quantity`] = 'Quantity must be greater than 0.';
      if (row.product && !row.allowDecimalQty && row.unit && !units.find((unit) => unit.name === row.unit)?.allowDecimal && !Number.isInteger(quantity)) {
        errors[`${prefix}.quantity`] = `Row ${index + 1}: quantity must be a whole number for ${row.unit}.`;
      }
      if (!Number.isFinite(freeQuantity) || freeQuantity < 0) errors[`${prefix}.freeQuantity`] = 'Free quantity cannot be negative.';
      if (!Number.isFinite(costPrice) || costPrice < 0) errors[`${prefix}.costPrice`] = 'Cost must be zero or greater.';
      if (!Number.isFinite(gstRate) || gstRate < 0 || gstRate > 100) errors[`${prefix}.gstRate`] = 'GST must be between 0 and 100.';
      if (!Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent > 100) errors[`${prefix}.discountPercent`] = 'Discount must be between 0 and 100.';
      if (row.product) {
        if (seenProducts.has(row.product)) {
          errors[`${prefix}.product`] = `This product is already in row ${seenProducts.get(row.product) + 1}.`;
        } else {
          seenProducts.set(row.product, index);
        }
      }
    });
    return errors;
  }

  function validatePurchaseForm() {
    const errors = validateRows(purchaseForm.rows, 'purchase');
    if (!purchaseForm.supplier) errors.supplier = 'Please select a supplier.';
    if (!purchaseForm.rows.some((row) => row.product)) errors.rows = 'Please add at least one product.';
    if (!Number.isFinite(Number(purchaseForm.paidAmount || 0)) || Number(purchaseForm.paidAmount || 0) < 0) errors.paidAmount = 'Amount paid must be zero or greater.';
    if (Number(purchaseForm.paidAmount || 0) > purchaseSummary.total) errors.paidAmount = 'Amount paid cannot exceed the purchase total.';
    if (!Number.isFinite(Number(purchaseForm.freightCharges || 0)) || Number(purchaseForm.freightCharges || 0) < 0) errors.freightCharges = 'Freight cannot be negative.';
    if (purchaseForm.roundOffMode === 'manual' && !Number.isFinite(Number(purchaseForm.roundOff || 0))) errors.roundOff = 'Round off must be a valid amount.';
    setFieldErrors(errors);
    return errors;
  }

  function requestRemoveRow(formKey, index, row) {
    if (isMeaningfulRow(row)) {
      setRowRemoveTarget({ formKey, index });
      return;
    }
    removeRow(formKey === 'purchase' ? setPurchaseForm : setPoForm, index);
  }

  function selectCreatedProduct(product) {
    if (!newProductTarget || !product?._id) return;
    const setter = newProductTarget.form === 'purchase' ? setPurchaseForm : setPoForm;
    setter((current) => ({
      ...current,
      rows: current.rows.map((row, rowIndex) => (
        rowIndex === newProductTarget.index ? { ...row, ...productPatch(product) } : row
      ))
    }));
    if (newProductTarget.form === 'purchase') {
      api.get('/purchases/price-history', { params: { product: product._id }, silent: true })
        .then(({ data }) => setPriceContext((current) => ({ ...current, [product._id]: data })))
        .catch(() => {});
    }
    focusRowField(newProductTarget.form, newProductTarget.index, 'quantity');
  }

  async function saveNewProduct() {
    if (!newProductForm.name.trim()) {
      toast.error('Enter product name');
      return;
    }

    setSavingProduct(true);
    try {
      const payload = {
        name: newProductForm.name.trim(),
        localName: newProductForm.localName.trim(),
        category: newProductForm.category || undefined,
        unit: newProductForm.unit || 'pcs',
        taxRate: Number(newProductForm.taxRate || 0),
        barcode: newProductForm.barcode.trim() || undefined,
        sku: newProductForm.sku.trim() || undefined,
        purchasePrice: Number(newProductForm.purchasePrice || 0),
        sellingPrice: Number(newProductForm.sellingPrice || 0),
        stock: Number(newProductForm.stock || 0),
        openingStock: Number(newProductForm.stock || 0)
      };
      const { data } = await api.post('/products', payload);
      const product = data.product;
      setProducts((current) => [product, ...current.filter((item) => item._id !== product._id)]);
      selectCreatedProduct(product);
      setNewProductTarget(null);
      setNewProductForm({ ...blankProductForm });
      toast.success('Product created');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to create product');
    } finally {
      setSavingProduct(false);
    }
  }

  const purchaseSummary = useMemo(() => calculatePurchaseTotals(purchaseForm.rows, purchaseForm), [purchaseForm]);
  const purchaseOutstanding = purchaseSummary.balance;
  const paidDisplayAmount = moneyRound(Math.min(number(purchaseForm.paidAmount), purchaseSummary.total));

  const poSummary = useMemo(() => calculatePurchaseTotals(poForm.rows, poForm), [poForm]);

  function updateManualRoundOff(value) {
    clearFieldError('roundOff');
    setPurchaseForm((current) => ({ ...current, roundOff: value, roundOffMode: 'manual' }));
  }

  function resetAutoRoundOff() {
    clearFieldError('roundOff');
    setPurchaseForm((current) => ({ ...current, roundOff: 0, roundOffMode: 'auto' }));
  }

  function updateManualPoRoundOff(value) {
    clearFieldError('poRoundOff');
    setPoForm((current) => ({ ...current, roundOff: value, roundOffMode: 'manual' }));
  }

  function resetAutoPoRoundOff() {
    clearFieldError('poRoundOff');
    setPoForm((current) => ({ ...current, roundOff: 0, roundOffMode: 'auto' }));
  }

  function itemPayload(rows) {
    return rows.map((row) => {
      const line = calculatePurchaseLine(row);
      return {
      product: row.product,
      quantity: line.quantity,
      unit: row.unit || 'pcs',
      batchNo: row.batchNo || undefined,
      expiryDate: row.expiryDate || undefined,
      costPrice: line.costPrice,
      purchasePrice: line.costPrice,
      freeQuantity: line.freeQuantity,
      gstRate: line.gstRate,
      gstInclusive: line.gstInclusive,
      taxableAmount: line.taxableAmount,
      gstAmount: line.gstAmount,
      cgst: line.cgst,
      sgst: line.sgst,
      igst: line.igst,
      discountPercent: number(row.discountPercent),
      discountAmount: line.discountAmount,
      mrp: Number(row.mrp || 0),
      wholesalePrice: Number(row.wholesalePrice || 0),
      retailPrice: Number(row.retailPrice || 0),
      sellingPrice: Number(row.sellingPrice || 0),
      netAmount: line.netAmount,
      lineTotal: line.lineTotal
      };
    });
  }

  function resetPurchaseForm() {
    setEditingPurchase(null);
    setFieldErrors({});
    setPurchaseForm({ purchaseNo: '', supplier: '', invoiceNumber: '', supplierInvoice: '', purchaseDate: new Date().toISOString().slice(0, 10), expectedDeliveryDate: '', paymentStatus: 'Unpaid', remarks: '', freightCharges: 0, roundOff: 0, roundOffMode: 'auto', paidAmount: 0, sourcePurchaseOrder: '', rows: [{ ...blankRow }] });
  }

  async function savePurchase(event) {
    event.preventDefault();
    const errors = validatePurchaseForm();
    if (Object.keys(errors).length) {
      toast.error(Object.values(errors)[0]);
      return;
    }
    const payload = {
      purchaseNo: purchaseForm.purchaseNo || undefined,
      supplier: purchaseForm.supplier || undefined,
      invoiceNumber: purchaseForm.invoiceNumber,
      supplierInvoice: purchaseForm.supplierInvoice || purchaseForm.invoiceNumber,
      purchaseDate: purchaseForm.purchaseDate,
      expectedDeliveryDate: purchaseForm.expectedDeliveryDate || undefined,
      remarks: purchaseForm.remarks,
      freightCharges: Number(purchaseForm.freightCharges || 0),
      roundOff: purchaseSummary.roundOff,
      roundOffMode: purchaseSummary.roundOffMode,
      paidAmount: Math.min(Number(purchaseForm.paidAmount || 0), purchaseSummary.total),
      discount: purchaseSummary.discount,
      sourcePurchaseOrder: purchaseForm.sourcePurchaseOrder || undefined,
      items: itemPayload(purchaseForm.rows)
    };
    setSavingPurchase(true);
    try {
      if (editingPurchase) {
        await api.put(`/purchases/${editingPurchase._id}`, payload);
        toast.success('Purchase updated and stock reconciled');
      } else {
        await api.post('/purchases', payload);
        toast.success('Purchase saved and stock updated');
      }
      resetPurchaseForm();
      await load();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to save purchase');
    } finally {
      setSavingPurchase(false);
    }
  }

  async function editPurchase(purchase) {
    const { data } = await api.get(`/purchases/${purchase._id}`);
    const current = data.purchase;
    const storedRoundOff = hasStoredRoundOff(current);
    const roundOffMode = roundOffModeForPurchase(current);
    setEditingPurchase(current);
    setPurchaseForm({
      purchaseNo: current.purchaseNo || '',
      supplier: current.supplier?._id || current.supplier || '',
      invoiceNumber: current.invoiceNumber || '',
      supplierInvoice: current.supplierInvoice || '',
      purchaseDate: String(current.purchaseDate || '').slice(0, 10),
      expectedDeliveryDate: current.expectedDeliveryDate ? String(current.expectedDeliveryDate).slice(0, 10) : '',
      paymentStatus: current.paymentStatus || 'Unpaid',
      remarks: current.remarks || current.notes || '',
      freightCharges: current.freightCharges || 0,
      roundOff: storedRoundOff ? current.roundOff : 0,
      roundOffMode,
      paidAmount: current.amountPaid ?? current.paidAmount ?? 0,
      sourcePurchaseOrder: current.sourcePurchaseOrder || '',
      rows: (current.items || []).map((item) => ({
        ...blankRow,
        product: item.product?._id || item.product || '',
        pid: item.product?.productId ? String(item.product.productId) : '',
        productName: item.product?.name || item.name || item.productName || '',
        localName: item.product?.localName || item.localName || '',
        sku: item.product?.sku || item.sku || '',
        barcode: item.product?.barcode || item.barcode || '',
        batchNo: item.batchNo || '',
        expiryDate: item.expiryDate ? String(item.expiryDate).slice(0, 10) : '',
        quantity: item.quantity || 1,
        freeQuantity: item.freeQuantity || 0,
        receivedFreeQuantity: item.receivedFreeQuantity || 0,
        unit: item.unit || 'pcs',
        costPrice: item.costPrice || item.purchasePrice || 0,
        gstRate: item.gstRate || 0,
        gstInclusive: Boolean(item.gstInclusive),
        discountPercent: item.discountPercent || 0,
        discountAmount: item.discountAmount || 0,
        mrp: item.mrp || 0,
        wholesalePrice: item.wholesalePrice || 0,
        retailPrice: item.retailPrice || item.sellingPrice || 0,
        sellingPrice: item.sellingPrice || item.retailPrice || 0
      }))
    });
  }

  async function duplicatePurchase(purchase) {
    const { data } = await api.post(`/purchases/${purchase._id}/duplicate`);
    toast.success(`Duplicated ${data.purchase.purchaseNo || 'purchase'}`);
    await load();
  }

  async function confirmDeletePurchase() {
    setDeletingPurchase(true);
    try {
      await api.delete(`/purchases/${deletePurchaseTarget._id}`);
      toast.success('Purchase deleted and stock reversed');
      setDeletePurchaseTarget(null);
      await load();
    } finally {
      setDeletingPurchase(false);
    }
  }

  function printPurchase(purchase) {
    setPrintingId(purchase._id);
    const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
    const rows = (purchase.items || []).map((item) => `<tr><td>${escape(item.name || item.product?.name || '')}</td><td>${escape(item.quantity || 0)}</td><td>${escape(item.freeQuantity || 0)}</td><td>${escape(item.unit || '')}</td><td>${Number(item.costPrice || 0).toFixed(2)}</td><td>${Number(item.discountAmount || 0).toFixed(2)}</td><td>${Number(item.gstRate || 0)}%</td><td>${Number(item.lineTotal || item.netAmount || 0).toFixed(2)}</td></tr>`).join('');
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      setPrintingId('');
      return;
    }
    const total = Number(purchase.grandTotal || purchase.total || 0);
    const paid = Number(purchase.amountPaid || purchase.paidAmount || 0);
    const balance = Number(purchase.balance ?? Math.max(total - paid, 0));
    printWindow.document.write(`<html><head><title>Purchase ${escape(purchase.purchaseNo || purchase.invoiceNumber || '')}</title><style>body{font-family:Arial,sans-serif;color:#111;margin:24px}.head{border-bottom:1px solid #111;padding-bottom:12px;margin-bottom:16px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:6px 24px;font-size:13px}table{width:100%;border-collapse:collapse;margin-top:16px;font-size:12px}th,td{border:1px solid #999;padding:6px;text-align:left}th{background:#f3f4f6}.totals{margin-left:auto;margin-top:16px;width:320px;font-size:13px}.totals div{display:flex;justify-content:space-between;padding:4px 0}.grand{border-top:1px solid #111;font-weight:700;font-size:15px}@media print{button{display:none}}</style></head><body><button onclick="window.print()">Print</button><div class="head"><h2>StoreDesk Purchase</h2><div class="grid"><div><b>Purchase No:</b> ${escape(purchase.purchaseNo || '-')}</div><div><b>Supplier Invoice:</b> ${escape(purchase.supplierInvoice || purchase.invoiceNumber || '-')}</div><div><b>Supplier:</b> ${escape(purchase.supplier?.name || '-')}</div><div><b>Date:</b> ${escape(dateTime(purchase.purchaseDate || purchase.createdAt))}</div><div><b>Status:</b> ${escape(purchase.paymentStatus || '-')}</div><div><b>GST:</b> ${escape(purchase.supplier?.gstNumber || '-')}</div></div></div><table><thead><tr><th>Product</th><th>Qty</th><th>Free</th><th>Unit</th><th>Rate</th><th>Discount</th><th>GST</th><th>Line Total</th></tr></thead><tbody>${rows}</tbody></table><div class="totals"><div><span>Subtotal</span><b>${Number(purchase.subTotal || 0).toFixed(2)}</b></div><div><span>Discount</span><b>${Number(purchase.discount || 0).toFixed(2)}</b></div><div><span>GST</span><b>${Number(purchase.gstTotal || 0).toFixed(2)}</b></div><div><span>Freight</span><b>${Number(purchase.freightCharges || 0).toFixed(2)}</b></div><div><span>Round Off</span><b>${Number(purchase.roundOff || 0).toFixed(2)}</b></div><div class="grand"><span>Grand Total</span><b>${total.toFixed(2)}</b></div><div><span>Paid</span><b>${paid.toFixed(2)}</b></div><div><span>Outstanding</span><b>${balance.toFixed(2)}</b></div></div></body></html>`);
    printWindow.document.close();
    printWindow.print();
    setTimeout(() => setPrintingId(''), 500);
  }

  function resetPoForm() {
    setEditingOrder(null);
    setFieldErrors({});
    setPoForm({
      poNumber: 'Auto generated',
      supplier: '',
      orderDate: new Date().toISOString().slice(0, 10),
      expectedDate: '',
      status: 'draft',
      referenceNumber: '',
      roundOff: 0,
      roundOffMode: 'auto',
      notes: '',
      rows: [{ ...blankRow }]
    });
  }

  function hydratePoForm(order) {
    setEditingOrder(order);
    setPoForm({
      poNumber: order.poNumber || 'Auto generated',
      supplier: order.supplier?._id || order.supplier || '',
      orderDate: String(order.orderDate || order.createdAt || '').slice(0, 10) || new Date().toISOString().slice(0, 10),
      expectedDate: order.expectedDate ? String(order.expectedDate).slice(0, 10) : '',
      status: order.status === 'pending' ? 'ordered' : order.status || 'draft',
      referenceNumber: order.referenceNumber || '',
      roundOff: order.roundOff || 0,
      roundOffMode: roundOffModeForPurchase(order),
      notes: order.notes || '',
      rows: (order.items || []).map((item) => ({
        ...blankRow,
        product: item.product?._id || item.product || '',
        pid: item.pid || (item.product?.productId ? String(item.product.productId) : ''),
        productName: item.product?.name || item.name || '',
        localName: item.product?.localName || '',
        sku: item.sku || item.product?.sku || '',
        barcode: item.barcode || item.product?.barcode || '',
        quantity: item.quantity || 1,
        freeQuantity: item.freeQuantity || 0,
        unit: item.unit || 'pcs',
        allowDecimalQty: Boolean(item.product?.allowDecimalQty),
        costPrice: item.costPrice || item.purchasePrice || 0,
        gstRate: item.gstRate || 0,
        gstInclusive: Boolean(item.gstInclusive),
        discountPercent: item.discountPercent || 0,
        discountAmount: item.discountAmount || 0,
        mrp: item.mrp || 0,
        wholesalePrice: item.wholesalePrice || 0,
        retailPrice: item.retailPrice || item.sellingPrice || 0,
        sellingPrice: item.sellingPrice || item.retailPrice || 0
      })).concat((order.items || []).length ? [] : [{ ...blankRow }])
    });
  }

  async function editOrder(order) {
    try {
      const { data } = await api.get(`/purchase-orders/${order._id}`);
      const current = data.purchaseOrder;
      if (!['draft', 'ordered', 'pending'].includes(current.status) || current.receivingHistory?.length) {
        toast.error('Only draft or unreceived ordered POs can be edited');
        return;
      }
      hydratePoForm(current);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to load purchase order');
    }
  }

  async function showOrder(order) {
    try {
      const { data } = await api.get(`/purchase-orders/${order._id}`);
      setViewOrder(data.purchaseOrder);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to load purchase order');
    }
  }

  async function savePurchaseOrder(event) {
    event.preventDefault();
    const errors = validateRows(poForm.rows, 'po');
    if (!poForm.supplier) errors.poSupplier = 'Please select a supplier.';
    if (poForm.expectedDate && poForm.orderDate && poForm.expectedDate < poForm.orderDate) errors.poExpectedDate = 'Expected date cannot be before PO date.';
    if (poForm.roundOffMode === 'manual' && !Number.isFinite(Number(poForm.roundOff || 0))) errors.poRoundOff = 'Round off must be a valid amount.';
    if (Object.keys(errors).length) {
      setFieldErrors(errors);
      toast.error(Object.values(errors)[0]);
      return;
    }
    setSavingOrder(true);
    try {
      const payload = {
        supplier: poForm.supplier,
        orderDate: poForm.orderDate || undefined,
        expectedDate: poForm.expectedDate || undefined,
        status: poForm.status || 'draft',
        referenceNumber: poForm.referenceNumber || undefined,
        roundOff: poSummary.roundOff,
        roundOffMode: poSummary.roundOffMode,
        notes: poForm.notes,
        items: itemPayload(poForm.rows)
      };
      if (editingOrder) {
        await api.put(`/purchase-orders/${editingOrder._id}`, payload);
        toast.success('Purchase order updated');
      } else {
        await api.post('/purchase-orders', payload);
        toast.success(poForm.status === 'ordered' ? 'Purchase order created' : 'Purchase order draft saved');
      }
      resetPoForm();
      await loadPurchaseOrders();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to save purchase order');
    } finally {
      setSavingOrder(false);
    }
  }

  async function markOrderOrdered(order) {
    try {
      const { data } = await api.get(`/purchase-orders/${order._id}`);
      const current = data.purchaseOrder;
      await api.put(`/purchase-orders/${order._id}`, {
        supplier: current.supplier?._id || current.supplier,
        orderDate: current.orderDate,
        expectedDate: current.expectedDate,
        status: 'ordered',
        referenceNumber: current.referenceNumber,
        roundOff: current.roundOff || 0,
        roundOffMode: roundOffModeForPurchase(current),
        notes: current.notes,
        items: (current.items || []).map((item) => ({
          product: item.product?._id || item.product,
          quantity: item.quantity,
          freeQuantity: item.freeQuantity || 0,
          unit: item.unit,
          costPrice: item.costPrice,
          purchasePrice: item.purchasePrice || item.costPrice,
          gstRate: item.gstRate || 0,
          gstInclusive: Boolean(item.gstInclusive),
          discountPercent: item.discountPercent || 0,
          discountAmount: item.discountAmount || 0,
          mrp: item.mrp || 0,
          wholesalePrice: item.wholesalePrice || 0,
          retailPrice: item.retailPrice || 0,
          sellingPrice: item.sellingPrice || 0
        }))
      });
      toast.success('Purchase order marked ordered');
      await loadPurchaseOrders();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to mark purchase order ordered');
    }
  }

  async function receiveGoods(order) {
    try {
      const { data } = await api.get(`/purchase-orders/${order._id}`);
      const current = data.purchaseOrder;
      if (!['ordered', 'pending', 'partially_received'].includes(current.status)) {
        toast.error('This purchase order cannot be received');
        return;
      }
      const rows = (current.items || []).map((item) => {
        const remaining = Math.max(Number(item.quantity || 0) - Number(item.receivedQuantity || 0), 0);
        return {
          product: item.product?._id || item.product,
          name: item.name || item.product?.name,
          ordered: Number(item.quantity || 0),
          previouslyReceived: Number(item.receivedQuantity || 0),
          remaining,
          receivedQuantity: remaining,
          freeQuantity: 0,
          unit: item.unit || 'pcs',
          costPrice: item.costPrice || 0,
          gstRate: item.gstRate || 0,
          lineTotal: item.lineTotal || 0
        };
      });
      if (!rows.some((row) => row.remaining > 0)) {
        toast.error('No pending quantity to receive');
        return;
      }
      setReceiveTarget(current);
      setReceiveRows(rows);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to load receiving details');
    }
  }

  async function confirmReceiveGoods() {
    const items = receiveRows
      .map((row) => ({
        product: row.product,
        receivedQuantity: Number(row.receivedQuantity || 0),
        freeQuantity: Number(row.freeQuantity || 0)
      }))
      .filter((row) => row.receivedQuantity > 0);
    const invalid = receiveRows.find((row) => Number(row.receivedQuantity || 0) > Number(row.remaining || 0));
    if (invalid) {
      toast.error(`Cannot receive more than remaining quantity for ${invalid.name}`);
      return;
    }
    if (!items.length) {
      toast.error('Enter at least one receive quantity');
      return;
    }
    setReceivingOrder(true);
    try {
      await api.post(`/purchase-orders/${receiveTarget._id}/receive`, { items });
      toast.success('Purchase order receiving saved');
      setReceiveTarget(null);
      setReceiveRows([]);
      await loadPurchaseOrders();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to receive goods');
    } finally {
      setReceivingOrder(false);
    }
  }

  function convertOrder(order) {
    setConvertTarget(order);
    setConvertInvoiceNumber(order.poNumber || '');
    setConvertError('');
  }

  async function confirmConvertOrder() {
    const invoiceNumber = convertInvoiceNumber.trim();
    if (!invoiceNumber) {
      setConvertError('Invoice Number is required');
      return;
    }

    setConvertingOrder(true);
    setConvertError('');
    try {
      const { data } = await api.get(`/purchase-orders/${convertTarget._id}`);
      const order = data.purchaseOrder;
      if (order.purchase || order.convertedAt) {
        setConvertError('Purchase Order has already been converted');
        return;
      }
      const rows = (order.items || []).map((item) => {
        const received = Number(item.receivedQuantity || 0);
        const quantity = received > 0 ? received : Number(item.quantity || 0);
        const freeQuantity = received > 0 ? Number(item.receivedFreeQuantity || 0) : Number(item.freeQuantity || 0);
        return {
          ...blankRow,
          product: item.product?._id || item.product || '',
          pid: item.pid || (item.product?.productId ? String(item.product.productId) : ''),
          productName: item.product?.name || item.name || '',
          localName: item.product?.localName || '',
          sku: item.sku || item.product?.sku || '',
          barcode: item.barcode || item.product?.barcode || '',
          quantity,
          freeQuantity,
          unit: item.unit || 'pcs',
          allowDecimalQty: Boolean(item.product?.allowDecimalQty),
          costPrice: item.costPrice || item.purchasePrice || 0,
          gstRate: item.gstRate || 0,
          gstInclusive: Boolean(item.gstInclusive),
          discountPercent: item.discountPercent || 0,
          discountAmount: item.discountAmount || 0,
          mrp: item.mrp || 0,
          wholesalePrice: item.wholesalePrice || 0,
          retailPrice: item.retailPrice || item.sellingPrice || 0,
          sellingPrice: item.sellingPrice || item.retailPrice || 0
        };
      });
      setPurchaseForm({
        purchaseNo: '',
        supplier: order.supplier?._id || order.supplier || '',
        invoiceNumber,
        supplierInvoice: invoiceNumber,
        purchaseDate: new Date().toISOString().slice(0, 10),
        expectedDeliveryDate: order.expectedDate ? String(order.expectedDate).slice(0, 10) : '',
        paymentStatus: 'Unpaid',
        remarks: `Converted from ${order.poNumber}${order.notes ? ` - ${order.notes}` : ''}`,
        freightCharges: 0,
        roundOff: order.roundOff || 0,
        roundOffMode: roundOffModeForPurchase(order),
        paidAmount: 0,
        sourcePurchaseOrder: order._id,
        rows: rows.length ? rows : [{ ...blankRow }]
      });
      setActiveTab('purchase');
      toast.success('Purchase order loaded into Purchase Entry');
      setConvertTarget(null);
      setConvertInvoiceNumber('');
      setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 0);
    } catch (error) {
      setConvertError(error.response?.data?.message || 'Failed to load purchase order into Purchase Entry');
    } finally {
      setConvertingOrder(false);
    }
  }

  function cancelOrder(order) {
    setCancelTarget(order);
    setCancelReason('');
    setCancelError('');
  }

  async function confirmCancelOrder() {
    if (!cancelReason.trim()) {
      setCancelError('Cancellation reason is required');
      return;
    }
    setCancellingOrder(true);
    try {
      await api.post(`/purchase-orders/${cancelTarget._id}/cancel`, { reason: cancelReason.trim() });
      toast.success('Purchase order cancelled');
      setCancelTarget(null);
      setCancelReason('');
      await loadPurchaseOrders();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to cancel purchase order');
    } finally {
      setCancellingOrder(false);
    }
  }

  async function printPurchaseOrder(order) {
    try {
      await api.post(`/purchase-orders/${order._id}/print`, {}, { silent: true });
    } catch {
      // Printing should still work if the audit endpoint fails.
    }
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
    const rows = (order.items || []).map((item) => `<tr><td>${escape(item.pid || item.product?.productId || '')}</td><td>${escape(item.sku || item.product?.sku || '')}</td><td>${escape(item.name || item.product?.name || '')}</td><td>${escape(item.quantity || 0)}</td><td>${escape(item.freeQuantity || 0)}</td><td>${escape(item.unit || '')}</td><td>${Number(item.costPrice || 0).toFixed(2)}</td><td>${Number(item.discountAmount || 0).toFixed(2)}</td><td>${Number(item.gstRate || 0)}%</td><td>${Number(item.lineTotal || 0).toFixed(2)}</td></tr>`).join('');
    printWindow.document.write(`<html><head><title>${escape(order.poNumber)}</title><style>body{font-family:Arial,sans-serif;color:#111;margin:24px}.head{border-bottom:2px solid #111;padding-bottom:12px;margin-bottom:16px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:6px 24px;font-size:13px}table{width:100%;border-collapse:collapse;margin-top:16px;font-size:12px}th,td{border:1px solid #999;padding:6px;text-align:left}th{background:#f3f4f6}.totals{margin-left:auto;margin-top:16px;width:320px;font-size:13px}.totals div{display:flex;justify-content:space-between;padding:4px 0}.grand{border-top:1px solid #111;font-weight:700;font-size:15px}@media print{button{display:none}}</style></head><body><button onclick="window.print()">Print</button><div class="head"><h1>PURCHASE ORDER</h1><div class="grid"><div><b>PO Number:</b> ${escape(order.poNumber)}</div><div><b>PO Date:</b> ${escape(dateTime(order.orderDate || order.createdAt))}</div><div><b>Expected Date:</b> ${escape(dateTime(order.expectedDate))}</div><div><b>Reference:</b> ${escape(order.referenceNumber || '-')}</div><div><b>Supplier:</b> ${escape(order.supplier?.name || '-')}</div><div><b>Supplier GST:</b> ${escape(order.supplier?.gstNumber || '-')}</div><div><b>Mobile:</b> ${escape(order.supplier?.mobile || '-')}</div><div><b>Status:</b> ${escape(statusLabels[order.status] || order.status)}</div></div></div><table><thead><tr><th>PID</th><th>SKU</th><th>Product</th><th>Qty</th><th>Free</th><th>Unit</th><th>Cost</th><th>Discount</th><th>GST</th><th>Total</th></tr></thead><tbody>${rows}</tbody></table><div class="totals"><div><span>Subtotal</span><b>${Number(order.subTotal || 0).toFixed(2)}</b></div><div><span>Discount</span><b>${Number(order.discount || 0).toFixed(2)}</b></div><div><span>Taxable</span><b>${Number(order.taxableAmount || 0).toFixed(2)}</b></div><div><span>GST</span><b>${Number(order.gstTotal || 0).toFixed(2)}</b></div><div><span>Round Off</span><b>${Number(order.roundOff || 0).toFixed(2)}</b></div><div class="grand"><span>Grand Total</span><b>${Number(order.grandTotal || order.total || 0).toFixed(2)}</b></div></div><p><b>Notes:</b> ${escape(order.notes || '-')}</p></body></html>`);
    printWindow.document.close();
    printWindow.print();
  }

  function renderRows(rows, onProduct, onUpdate, onRemove, formKey) {
    return rows.map((row, index) => {
      const context = row.product ? priceContext[row.product] : null;
      const rowKey = `${formKey}-${index}`;
      const error = (field) => fieldErrors[`${formKey}.${index}.${field}`];
      const update = (patch) => {
        Object.keys(patch).forEach((field) => clearFieldError(`${formKey}.${index}.${field}`));
        onUpdate(index, patch);
      };
      const rowActive = activeRowKey === rowKey;
      return (
        <div
          key={index}
          className={`rounded-lg border p-3 transition ${rowActive ? 'border-emerald-400 bg-emerald-50/40 shadow-sm dark:bg-emerald-950/10' : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900'}`}
          onFocusCapture={() => setActiveRowKey(rowKey)}
          onKeyDown={(event) => {
            if (event.ctrlKey && event.key === 'Enter') {
              event.preventDefault();
              if (formKey === 'purchase') addPurchaseRow();
              else setPoForm((current) => ({ ...current, rows: [...current.rows, { ...blankRow }] }));
            }
          }}
        >
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Row {index + 1}</div>
            <div className="flex items-center gap-3">
              <strong className="text-sm">{currency(lineTotal(row))}</strong>
              <button type="button" className="btn-muted h-8 w-8 p-0 text-red-600" onClick={() => onRemove(index)} title="Remove row">
                <Trash2 size={14} />
              </button>
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-[6rem_minmax(16rem,1fr)_6rem_6rem_6rem]">
            <label className="space-y-1">
              <span className="text-xs font-semibold text-slate-500">PID</span>
              <input className="input" data-row-key={rowKey} data-field="pid" inputMode="numeric" value={row.pid || ''} onChange={(event) => handlePidChange(formKey, index, event.target.value, onProduct, onUpdate)} onKeyDown={(event) => handlePidKeyDown(event, formKey, index, row, onProduct)} placeholder="PID" />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-semibold text-slate-500">Product</span>
              <PurchaseProductCombobox row={row} products={products} formKey={formKey} index={index} onProduct={onProduct} onSelectedProduct={rememberProduct} onFocusNext={() => focusRowField(formKey, index, 'quantity')} />
              {error('product') ? <p className="text-xs font-semibold text-red-600">{error('product')}</p> : null}
            </label>
            <label className="space-y-1">
              <span className="text-xs font-semibold text-slate-500">Qty</span>
              <input className="input" data-row-key={rowKey} data-field="quantity" type="number" step="0.001" min="0.001" value={row.quantity} onChange={(event) => update({ quantity: event.target.value })} onKeyDown={(event) => handleEntryKeyDown(event, formKey, index, 'freeQuantity')} />
              {error('quantity') ? <p className="text-xs font-semibold text-red-600">{error('quantity')}</p> : null}
            </label>
            <label className="space-y-1">
              <span className="text-xs font-semibold text-slate-500">Free</span>
              <input className="input" data-row-key={rowKey} data-field="freeQuantity" type="number" step="0.001" min="0" value={row.freeQuantity} onChange={(event) => update({ freeQuantity: event.target.value })} onKeyDown={(event) => handleEntryKeyDown(event, formKey, index, 'unit')} />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-semibold text-slate-500">Unit</span>
              <select className="input" data-row-key={rowKey} data-field="unit" value={row.unit} onChange={(event) => update({ unit: event.target.value })} onKeyDown={(event) => handleEntryKeyDown(event, formKey, index, 'cost')}>
                {units.map((unit) => <option key={unit._id} value={unit.name}>{unit.name}</option>)}
              </select>
            </label>
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-4 xl:grid-cols-7">
            <label className="space-y-1"><span className="text-xs font-semibold text-slate-500">Cost</span><input className="input" data-row-key={rowKey} data-field="cost" type="number" step="0.01" min="0" value={row.costPrice} onChange={(event) => update({ costPrice: event.target.value })} onKeyDown={(event) => handleEntryKeyDown(event, formKey, index, 'gst')} />{error('costPrice') ? <p className="text-xs font-semibold text-red-600">{error('costPrice')}</p> : null}</label>
            <label className="space-y-1"><span className="text-xs font-semibold text-slate-500">GST %</span><input className="input" data-row-key={rowKey} data-field="gst" type="number" step="0.01" min="0" max="100" value={row.gstRate} onChange={(event) => update({ gstRate: event.target.value })} onKeyDown={(event) => handleEntryKeyDown(event, formKey, index, 'discount')} />{error('gstRate') ? <p className="text-xs font-semibold text-red-600">{error('gstRate')}</p> : null}</label>
            <label className="space-y-1"><span className="text-xs font-semibold text-slate-500">Disc %</span><input className="input" data-row-key={rowKey} data-field="discount" type="number" step="0.01" min="0" max="100" value={row.discountPercent} onChange={(event) => update({ discountPercent: event.target.value, discountAmount: '' })} onKeyDown={(event) => handleEntryKeyDown(event, formKey, index, 'mrp')} />{error('discountPercent') ? <p className="text-xs font-semibold text-red-600">{error('discountPercent')}</p> : null}</label>
            <label className="space-y-1"><span className="text-xs font-semibold text-slate-500">MRP</span><input className="input" data-row-key={rowKey} data-field="mrp" type="number" step="0.01" min="0" value={row.mrp} onChange={(event) => update({ mrp: event.target.value })} onKeyDown={(event) => handleEntryKeyDown(event, formKey, index, 'wholesale')} /></label>
            <label className="space-y-1"><span className="text-xs font-semibold text-slate-500">Wholesale</span><input className="input" data-row-key={rowKey} data-field="wholesale" type="number" step="0.01" min="0" value={row.wholesalePrice} onChange={(event) => update({ wholesalePrice: event.target.value })} onKeyDown={(event) => handleEntryKeyDown(event, formKey, index, 'retail')} /></label>
            <label className="space-y-1"><span className="text-xs font-semibold text-slate-500">Retail</span><input className="input" data-row-key={rowKey} data-field="retail" type="number" step="0.01" min="0" value={row.retailPrice} onChange={(event) => update({ retailPrice: event.target.value, sellingPrice: event.target.value })} onKeyDown={(event) => handleEntryKeyDown(event, formKey, index, 'selling')} /></label>
            <label className="space-y-1"><span className="text-xs font-semibold text-slate-500">Selling</span><input className="input" data-row-key={rowKey} data-field="selling" type="number" step="0.01" min="0" value={row.sellingPrice} onChange={(event) => update({ sellingPrice: event.target.value })} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); if (formKey === 'purchase') document.getElementById('purchase-add-row')?.focus(); } }} /></label>
          </div>

          {context ? (
            <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-2 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
              <span className="font-semibold">Supplier price history:</span> Previous {currency(context.lastPurchasePrice || 0)} from {context.lastSupplier?.name || '-'} | Average {currency(context.averagePurchasePrice || 0)}
            </div>
          ) : null}
        </div>
      );
    });
  }

  return (
    <div>
      <PageHeader title="Purchases" description="Create supplier purchases, track supplier price history, and manage purchase orders." />

      <div className="mb-5 flex flex-wrap gap-2">
        <button className={activeTab === 'purchase' ? 'btn-primary' : 'btn-muted'} onClick={() => setActiveTab('purchase')}><FileText size={16} />Purchase Entry</button>
        <button className={activeTab === 'orders' ? 'btn-primary' : 'btn-muted'} onClick={() => setActiveTab('orders')}><CheckCircle2 size={16} />Purchase Orders</button>
      </div>

      {activeTab === 'purchase' ? (
        <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
          <form className="panel space-y-4 p-5" onSubmit={savePurchase}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3 dark:border-slate-800">
              <div>
                <h2 className="font-semibold">{editingPurchase ? 'Edit Purchase' : 'New Purchase'}</h2>
                <p className="text-xs text-slate-500">Actual received purchases update stock after save.</p>
              </div>
              <span className="rounded-md bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {editingPurchase ? 'Editing saved purchase' : 'Stock update on save'}
              </span>
            </div>

            <div className="grid gap-3 lg:grid-cols-4">
              <label className="space-y-1 lg:col-span-2">
                <span className="text-xs font-semibold text-slate-500">Supplier</span>
                <SupplierCombobox value={purchaseForm.supplier} suppliers={suppliers} loading={loadingInitial} onChange={(supplier) => { clearFieldError('supplier'); setPurchaseForm((current) => ({ ...current, supplier })); }} />
                {fieldErrors.supplier ? <p className="text-xs font-semibold text-red-600">{fieldErrors.supplier}</p> : null}
              </label>
              <label className="space-y-1">
                <span className="text-xs font-semibold text-slate-500">Purchase Date</span>
                <input className="input" type="date" value={purchaseForm.purchaseDate} onChange={(event) => setPurchaseForm((current) => ({ ...current, purchaseDate: event.target.value }))} />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-semibold text-slate-500">Delivery Date</span>
                <input className="input" type="date" value={purchaseForm.expectedDeliveryDate} onChange={(event) => setPurchaseForm((current) => ({ ...current, expectedDeliveryDate: event.target.value }))} />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-semibold text-slate-500">Purchase Number</span>
                <input className="input" placeholder="Auto-generated" value={purchaseForm.purchaseNo} onChange={(event) => setPurchaseForm((current) => ({ ...current, purchaseNo: event.target.value }))} />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-semibold text-slate-500">Supplier Invoice</span>
                <input className="input" placeholder="Supplier invoice no" value={purchaseForm.supplierInvoice} onChange={(event) => setPurchaseForm((current) => ({ ...current, supplierInvoice: event.target.value, invoiceNumber: event.target.value }))} />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-semibold text-slate-500">Payment Status</span>
                <input className="input" value={purchaseSummary.balance <= 0.001 ? 'Paid' : Number(purchaseForm.paidAmount || 0) > 0 ? 'Partial' : 'Unpaid'} readOnly />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-semibold text-slate-500">Amount Paid</span>
                <input className="input" type="number" min="0" step="0.01" value={purchaseForm.paidAmount} onChange={(event) => { clearFieldError('paidAmount'); setPurchaseForm((current) => ({ ...current, paidAmount: event.target.value })); }} />
                {fieldErrors.paidAmount ? <p className="text-xs font-semibold text-red-600">{fieldErrors.paidAmount}</p> : null}
              </label>
              <label className="space-y-1">
                <span className="text-xs font-semibold text-slate-500">Freight</span>
                <input className="input" type="number" step="0.01" value={purchaseForm.freightCharges} onChange={(event) => { clearFieldError('freightCharges'); setPurchaseForm((current) => ({ ...current, freightCharges: event.target.value })); }} />
              </label>
              <label className="space-y-1 lg:col-span-2">
                <span className="text-xs font-semibold text-slate-500">Notes / Remarks</span>
                <input className="input" placeholder="Remarks" value={purchaseForm.remarks} onChange={(event) => setPurchaseForm((current) => ({ ...current, remarks: event.target.value }))} />
              </label>
            </div>

            <div className="space-y-3">
              {fieldErrors.rows ? <p className="text-sm font-semibold text-red-600">{fieldErrors.rows}</p> : null}
              {renderRows(purchaseForm.rows, selectPurchaseProduct, updatePurchaseRow, (index) => requestRemoveRow('purchase', index, purchaseForm.rows[index]), 'purchase')}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4 dark:border-slate-800">
              <button id="purchase-add-row" type="button" className="btn-muted" onClick={addPurchaseRow}><Plus size={16} />Add Row</button>
              <div className="flex flex-wrap items-center justify-end gap-3">
                {editingPurchase ? <button type="button" className="btn-muted" onClick={resetPurchaseForm}>Cancel Edit</button> : null}
                <span className="text-sm text-slate-500">{purchaseSummary.items} items / {purchaseSummary.quantity} qty</span>
                <span className="text-sm text-slate-500">GST {currency(purchaseSummary.gstTotal)} / Discount {currency(purchaseSummary.discount)}</span>
                <span className="text-sm text-slate-500">Pre-round {currency(purchaseSummary.preRoundTotal)}</span>
                <label className="flex items-center gap-2 text-sm">
                  <span className="text-slate-500">Round Off</span>
                  <input
                    className="input h-9 w-24 text-right"
                    type="number"
                    step="0.01"
                    value={purchaseForm.roundOffMode === 'manual' ? purchaseForm.roundOff : purchaseSummary.roundOff}
                    onChange={(event) => updateManualRoundOff(event.target.value)}
                  />
                </label>
                {purchaseForm.roundOffMode === 'manual' ? (
                  <button type="button" className="btn-muted h-9 whitespace-nowrap px-2 text-xs" onClick={resetAutoRoundOff}>Reset Auto</button>
                ) : (
                  <span className="rounded-md bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200">Auto</span>
                )}
                <strong className="text-lg">Grand Total {currency(purchaseSummary.total)}</strong>
                <span className="rounded-md bg-orange-50 px-3 py-2 text-sm font-semibold text-orange-700">Outstanding {currency(purchaseOutstanding)}</span>
                <button className="btn-primary" disabled={savingPurchase}>{savingPurchase ? 'Saving...' : editingPurchase ? 'Update Purchase' : 'Save Purchase'}</button>
              </div>
              {fieldErrors.roundOff ? <p className="w-full text-right text-xs font-semibold text-red-600">{fieldErrors.roundOff}</p> : null}
            </div>
          </form>

          <div className="panel space-y-4 p-5">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-800 dark:bg-slate-950">
              <h2 className="mb-3 font-semibold">Purchase Summary</h2>
              {[
                ['Subtotal', purchaseSummary.subTotal],
                ['Discount', purchaseSummary.discount],
                ['GST', purchaseSummary.gstTotal],
                ['Freight', purchaseSummary.freightCharges],
                ['Round Off', purchaseSummary.roundOff]
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between gap-3 py-1"><span className="text-slate-500">{label}</span><span>{currency(value)}</span></div>
              ))}
              <div className="mt-2 border-t border-slate-200 pt-2 dark:border-slate-800">
                <div className="flex justify-between gap-3 py-1 text-base font-bold"><span>Grand Total</span><span>{currency(purchaseSummary.total)}</span></div>
                <div className="flex justify-between gap-3 py-1"><span className="text-slate-500">Paid</span><span>{currency(paidDisplayAmount)}</span></div>
                <div className="flex justify-between gap-3 py-1 font-semibold text-orange-700"><span>Outstanding</span><span>{currency(purchaseOutstanding)}</span></div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-semibold">Purchase History</h2>
                <button className="btn-muted h-9" onClick={loadPurchases} disabled={loadingPurchases} title="Refresh purchase history"><RefreshCw size={15} />{loadingPurchases ? 'Refreshing...' : 'Refresh'}</button>
              </div>
              <div className="grid gap-2">
                <input className="input h-9" placeholder="Search purchase, supplier, invoice" value={purchaseSearch} onChange={(event) => setPurchaseSearch(event.target.value)} />
                <div className="grid grid-cols-2 gap-2">
                  <input className="input h-9" type="date" value={purchaseFilters.from} onChange={(event) => setPurchaseFilters((current) => ({ ...current, from: event.target.value }))} />
                  <input className="input h-9" type="date" value={purchaseFilters.to} onChange={(event) => setPurchaseFilters((current) => ({ ...current, to: event.target.value }))} />
                </div>
                <select className="input h-9" value={purchaseFilters.paymentStatus} onChange={(event) => setPurchaseFilters((current) => ({ ...current, paymentStatus: event.target.value }))}>
                  <option value="">All payment statuses</option>
                  <option value="Unpaid">Unpaid</option>
                  <option value="Partial">Partial</option>
                  <option value="Paid">Paid</option>
                </select>
                <div className="flex gap-2">
                  <button className="btn-muted h-9 flex-1" onClick={loadPurchases} disabled={loadingPurchases}><Search size={15} />Search</button>
                  <button className="btn-muted h-9" onClick={() => { setPurchaseSearch(''); setPurchaseFilters({ from: '', to: '', paymentStatus: '', supplier: '' }); setTimeout(loadPurchases, 0); }} disabled={loadingPurchases}>Clear</button>
                </div>
              </div>
            </div>
            <div className="mt-4 max-h-[calc(100vh-(var(--header-height)+var(--purchase-history-offset)))] space-y-3 overflow-y-auto">
              {purchases.map((purchase) => (
                <div key={purchase._id} className="rounded-md border border-slate-200 p-3 text-sm dark:border-slate-800">
                  <div className="flex justify-between gap-3"><strong>{purchase.purchaseNo || purchase.invoiceNumber || purchase._id.slice(-6).toUpperCase()}</strong><span>{currency(purchase.grandTotal || purchase.total || 0)}</span></div>
                  <div className="mt-1 text-slate-500">{purchase.supplier?.name || '-'} | Inv {purchase.supplierInvoice || purchase.invoiceNumber || '-'} | {dateTime(purchase.purchaseDate || purchase.createdAt)}</div>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                    <span>Items: <b>{purchase.itemCount || purchase.items?.length || 0}</b></span>
                    <span>Paid: <b>{currency(purchase.paidAmount || purchase.amountPaid || 0)}</b></span>
                    <span className="text-orange-700">Due: <b>{currency(purchase.balance || Math.max(Number(purchase.total || 0) - Number(purchase.paidAmount || 0), 0))}</b></span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button className="btn-muted h-8 px-2 py-1" onClick={() => setViewPurchase(purchase)} title="View"><Eye size={14} /></button>
                    <button className="btn-muted h-8 px-2 py-1" onClick={() => editPurchase(purchase)} title="Edit"><Pencil size={14} /></button>
                    <button className="btn-muted h-8 px-2 py-1" onClick={() => duplicatePurchase(purchase)} title="Duplicate"><Copy size={14} /></button>
                    <button className="btn-muted h-8 px-2 py-1" onClick={() => printPurchase(purchase)} title="Print"><Printer size={14} /></button>
                    <button className="btn-muted h-8 px-2 py-1 text-red-600" onClick={() => setDeletePurchaseTarget(purchase)} title="Delete"><Trash2 size={14} /></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          <form className="panel space-y-4 p-5" onSubmit={savePurchaseOrder}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3 dark:border-slate-800">
              <div>
                <h2 className="font-semibold">{editingOrder ? `Edit Purchase Order ${poForm.poNumber}` : 'Purchase Order'}</h2>
                <p className="text-xs text-slate-500">Purchase orders do not update stock or accounting until converted through purchase processing.</p>
              </div>
              <span className="rounded-md bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">Status: {statusLabels[poForm.status] || 'Draft'}</span>
            </div>
            <div className="grid gap-3 md:grid-cols-4">
              <label className="space-y-1">
                <span className="text-xs font-semibold text-slate-500">PO Number</span>
                <input className="input" value={poForm.poNumber} readOnly />
              </label>
              <label className="space-y-1 md:col-span-2">
                <span className="text-xs font-semibold text-slate-500">Supplier</span>
                <SupplierCombobox value={poForm.supplier} suppliers={suppliers} loading={loadingInitial} onChange={(supplier) => { clearFieldError('poSupplier'); setPoForm((current) => ({ ...current, supplier })); }} />
                {fieldErrors.poSupplier ? <p className="text-xs font-semibold text-red-600">{fieldErrors.poSupplier}</p> : null}
              </label>
              <label className="space-y-1">
                <span className="text-xs font-semibold text-slate-500">PO Date</span>
                <input className="input" type="date" value={poForm.orderDate} onChange={(event) => setPoForm((current) => ({ ...current, orderDate: event.target.value }))} />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-semibold text-slate-500">Expected Date</span>
                <input className="input" type="date" value={poForm.expectedDate} onChange={(event) => { clearFieldError('poExpectedDate'); setPoForm((current) => ({ ...current, expectedDate: event.target.value })); }} />
                {fieldErrors.poExpectedDate ? <p className="text-xs font-semibold text-red-600">{fieldErrors.poExpectedDate}</p> : null}
              </label>
              <label className="space-y-1">
                <span className="text-xs font-semibold text-slate-500">Save Mode</span>
                <select className="input" value={poForm.status} onChange={(event) => setPoForm((current) => ({ ...current, status: event.target.value }))} disabled={editingOrder && !['draft', 'ordered', 'pending'].includes(editingOrder.status)}>
                  {!editingOrder || editingOrder.status === 'draft' ? <option value="draft">Save Draft</option> : null}
                  <option value="ordered">Mark Ordered</option>
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-xs font-semibold text-slate-500">Reference No.</span>
                <input className="input" placeholder="Optional reference" value={poForm.referenceNumber} onChange={(event) => setPoForm((current) => ({ ...current, referenceNumber: event.target.value }))} />
              </label>
              <label className="space-y-1 md:col-span-4">
                <span className="text-xs font-semibold text-slate-500">Notes</span>
                <textarea className="input min-h-20" placeholder="Notes or terms" value={poForm.notes} onChange={(event) => setPoForm((current) => ({ ...current, notes: event.target.value }))} />
              </label>
            </div>
            <div className="space-y-3">
              {fieldErrors.rows ? <p className="text-sm font-semibold text-red-600">{fieldErrors.rows}</p> : null}
              {renderRows(poForm.rows, selectPoProduct, updatePoRow, (index) => requestRemoveRow('po', index, poForm.rows[index]), 'po')}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4 dark:border-slate-800">
              <button type="button" className="btn-muted" onClick={() => setPoForm((current) => {
                const nextIndex = current.rows.length;
                setTimeout(() => focusRowField('po', nextIndex, 'product'), 0);
                return { ...current, rows: [...current.rows, { ...blankRow }] };
              })}><Plus size={16} />Add Row</button>
              <div className="flex flex-wrap items-center justify-end gap-3 text-sm">
                <span>Qty <b>{poSummary.quantity}</b></span>
                <span>GST <b>{currency(poSummary.gstTotal)}</b></span>
                <span>Discount <b>{currency(poSummary.discount)}</b></span>
                <span>Pre-round <b>{currency(poSummary.preRoundTotal)}</b></span>
                <label className="flex items-center gap-2">
                  <span className="text-slate-500">Round Off</span>
                  <input
                    className="input h-9 w-24 text-right"
                    type="number"
                    step="0.01"
                    value={poForm.roundOffMode === 'manual' ? poForm.roundOff : poSummary.roundOff}
                    onChange={(event) => updateManualPoRoundOff(event.target.value)}
                  />
                </label>
                {poForm.roundOffMode === 'manual' ? (
                  <button type="button" className="btn-muted h-9 whitespace-nowrap px-2 text-xs" onClick={resetAutoPoRoundOff}>Reset Auto</button>
                ) : (
                  <span className="rounded-md bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200">Auto</span>
                )}
                <strong className="text-lg">Grand Total {currency(poSummary.total)}</strong>
                {editingOrder ? <button type="button" className="btn-muted" onClick={resetPoForm}>Cancel Edit</button> : null}
                <button className="btn-primary" disabled={savingOrder}>{savingOrder ? 'Saving...' : editingOrder ? 'Update PO' : poForm.status === 'ordered' ? 'Create Order' : 'Save Draft'}</button>
              </div>
              {fieldErrors.poRoundOff ? <p className="w-full text-right text-xs font-semibold text-red-600">{fieldErrors.poRoundOff}</p> : null}
            </div>
          </form>

          <div className="scroll-panel">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
              <h2 className="font-semibold">Purchase Orders</h2>
              <div className="flex flex-wrap gap-2">
                <select className="input w-44" value={poStatus} onChange={(event) => setPoStatus(event.target.value)}>
                  <option value="">All statuses</option>
                  {poStatusOptions.map((value) => <option key={value} value={value}>{statusLabels[value]}</option>)}
                </select>
                <input className="input w-36" type="date" value={poDateFilter.from} onChange={(event) => setPoDateFilter((current) => ({ ...current, from: event.target.value, preset: 'custom' }))} />
                <input className="input w-36" type="date" value={poDateFilter.to} onChange={(event) => setPoDateFilter((current) => ({ ...current, to: event.target.value, preset: 'custom' }))} />
                <select className="input w-40" value={poDateFilter.preset || 'month'} onChange={(event) => setPoDateFilter(event.target.value === 'custom' ? { ...poDateFilter, preset: 'custom' } : datePresetRange(event.target.value))}>
                  <option value="today">Today</option>
                  <option value="yesterday">Yesterday</option>
                  <option value="week">This Week</option>
                  <option value="month">This Month</option>
                  <option value="previousMonth">Previous Month</option>
                  <option value="year">This Year</option>
                  <option value="custom">Custom</option>
                </select>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-2.5 text-slate-400" size={16} />
                  <input className="input pl-9" placeholder="PO, supplier, mobile, reference" value={poSearch} onChange={(event) => setPoSearch(event.target.value)} />
                </div>
                <button className="btn-muted" onClick={loadPurchaseOrders} disabled={loadingOrders}><RefreshCw size={15} />{loadingOrders ? 'Refreshing...' : 'Refresh'}</button>
              </div>
            </div>
            <div className="table-shell">
              <table className="w-full table-sticky">
                <thead><tr><th className="table-th">PO Number</th><th className="table-th">Supplier</th><th className="table-th">Status</th><th className="table-th">Ordered Qty</th><th className="table-th">Received Qty</th><th className="table-th">Total</th><th className="table-th">Expected</th><th className="table-th">Created</th><th className="table-th"></th></tr></thead>
                <tbody>
                  {loadingOrders ? (
                    <tr><td className="table-td py-10 text-center text-slate-500" colSpan={9}>Loading purchase orders...</td></tr>
                  ) : purchaseOrders.length ? purchaseOrders.map((order) => {
                    const ordered = (order.items || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0);
                    const received = (order.items || []).reduce((sum, item) => sum + Number(item.receivedQuantity || 0), 0);
                    const status = order.status === 'pending' ? 'ordered' : order.status;
                    const canEdit = ['draft', 'ordered'].includes(status) && !(order.receivingHistory || []).length;
                    const canReceive = ['ordered', 'partially_received'].includes(status) && !order.purchase;
                    const canConvert = ['ordered', 'partially_received', 'completed'].includes(status) && !order.purchase && !order.convertedAt;
                    const canCancel = ['draft', 'ordered'].includes(status) && received <= 0 && !order.purchase;
                    return (
                      <tr key={order._id}>
                        <td className="table-td font-semibold">{order.poNumber}</td>
                        <td className="table-td">{order.supplier?.name || '-'}<div className="text-xs text-slate-500">{order.supplier?.mobile || order.referenceNumber || ''}</div></td>
                        <td className="table-td">{statusLabels[order.status] || order.status}</td>
                        <td className="table-td">{ordered}</td>
                        <td className="table-td">{received}</td>
                        <td className="table-td font-semibold">{currency(order.total || 0)}</td>
                        <td className="table-td">{dateTime(order.expectedDate)}</td>
                        <td className="table-td">{dateTime(order.orderDate || order.createdAt)}</td>
                        <td className="table-td">
                          <div className="flex justify-end gap-2">
                            <button className="btn-muted h-9 w-9 p-0" onClick={() => showOrder(order)} title="View"><Eye size={15} /></button>
                            <button className="btn-muted h-9 w-9 p-0" disabled={!canEdit} onClick={() => editOrder(order)} title="Edit"><Pencil size={15} /></button>
                            <PrintButton onClick={() => printPurchaseOrder(order)} />
                            {status === 'draft' ? <button className="btn-muted py-1.5" onClick={() => markOrderOrdered(order)}>Order</button> : null}
                            <button className="btn-muted py-1.5" disabled={!canReceive} onClick={() => receiveGoods(order)}>Receive</button>
                            <button className="btn-muted py-1.5" disabled={!canConvert} onClick={() => convertOrder(order)}>Convert</button>
                            <button className="btn-muted h-9 w-9 p-0 text-red-600" disabled={!canCancel} onClick={() => cancelOrder(order)} title="Cancel"><XCircle size={15} /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  }) : (
                    <tr><td className="table-td py-14 text-center text-slate-500" colSpan={9}><b>No Purchase Orders Found</b><br />Create your first Purchase Order.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {receiveTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="panel max-h-[90vh] w-full max-w-5xl overflow-auto p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold">Receive {receiveTarget.poNumber}</h2>
                <p className="text-sm text-slate-500">{receiveTarget.supplier?.name || '-'} | Receive quantities do not update stock until converted to purchase.</p>
              </div>
              <button type="button" className="btn-muted h-9 w-9 p-0" disabled={receivingOrder} onClick={() => setReceiveTarget(null)}><XCircle size={16} /></button>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead><tr><th className="table-th">Product</th><th className="table-th">Ordered</th><th className="table-th">Previous</th><th className="table-th">Remaining</th><th className="table-th">Receive Now</th><th className="table-th">Free Qty</th><th className="table-th">Unit</th><th className="table-th">Cost</th><th className="table-th">GST</th><th className="table-th">Total</th></tr></thead>
                <tbody>
                  {receiveRows.map((row, index) => (
                    <tr key={row.product}>
                      <td className="table-td font-semibold">{row.name}</td>
                      <td className="table-td">{row.ordered}</td>
                      <td className="table-td">{row.previouslyReceived}</td>
                      <td className="table-td">{row.remaining}</td>
                      <td className="table-td"><input className="input w-28" type="number" min="0" max={row.remaining} step="0.001" value={row.receivedQuantity} onChange={(event) => setReceiveRows((current) => current.map((item, rowIndex) => rowIndex === index ? { ...item, receivedQuantity: event.target.value } : item))} /></td>
                      <td className="table-td"><input className="input w-28" type="number" min="0" step="0.001" value={row.freeQuantity} onChange={(event) => setReceiveRows((current) => current.map((item, rowIndex) => rowIndex === index ? { ...item, freeQuantity: event.target.value } : item))} /></td>
                      <td className="table-td">{row.unit}</td>
                      <td className="table-td">{currency(row.costPrice)}</td>
                      <td className="table-td">{row.gstRate}%</td>
                      <td className="table-td">{currency(row.lineTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="btn-muted" disabled={receivingOrder} onClick={() => setReceiveTarget(null)}>Cancel</button>
              <button type="button" className="btn-primary" disabled={receivingOrder} onClick={confirmReceiveGoods}>{receivingOrder ? 'Receiving...' : 'Confirm Receive'}</button>
            </div>
          </div>
        </div>
      ) : null}

      {viewOrder ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="panel max-h-[90vh] w-full max-w-5xl overflow-auto p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold">Purchase Order {viewOrder.poNumber}</h2>
                <p className="text-sm text-slate-500">{viewOrder.supplier?.name || '-'} | {statusLabels[viewOrder.status] || viewOrder.status}</p>
              </div>
              <button className="btn-muted h-9 w-9 p-0" onClick={() => setViewOrder(null)}><XCircle size={16} /></button>
            </div>
            <div className="mt-4 grid gap-2 text-sm md:grid-cols-3">
              <div>PO Date: <b>{dateTime(viewOrder.orderDate || viewOrder.createdAt)}</b></div>
              <div>Expected: <b>{dateTime(viewOrder.expectedDate)}</b></div>
              <div>Reference: <b>{viewOrder.referenceNumber || '-'}</b></div>
              <div>Created By: <b>{viewOrder.user?.name || '-'}</b></div>
              <div>Converted: <b>{viewOrder.purchase?.purchaseNo || viewOrder.purchase?.invoiceNumber || '-'}</b></div>
              <div>Total: <b>{currency(viewOrder.grandTotal || viewOrder.total || 0)}</b></div>
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full">
                <thead><tr><th className="table-th">PID</th><th className="table-th">Product</th><th className="table-th">Ordered</th><th className="table-th">Free</th><th className="table-th">Received</th><th className="table-th">Received Free</th><th className="table-th">Remaining</th><th className="table-th">Unit</th><th className="table-th">Cost</th><th className="table-th">GST</th><th className="table-th">Total</th></tr></thead>
                <tbody>{(viewOrder.items || []).map((item, index) => <tr key={`${item.product?._id || item.product}-${index}`}><td className="table-td">{item.pid || item.product?.productId || '-'}</td><td className="table-td font-semibold">{item.name || item.product?.name}</td><td className="table-td">{item.quantity}</td><td className="table-td">{item.freeQuantity || 0}</td><td className="table-td">{item.receivedQuantity || 0}</td><td className="table-td">{item.receivedFreeQuantity || 0}</td><td className="table-td">{Math.max(Number(item.quantity || 0) - Number(item.receivedQuantity || 0), 0)}</td><td className="table-td">{item.unit}</td><td className="table-td">{currency(item.costPrice)}</td><td className="table-td">{item.gstRate || 0}%</td><td className="table-td">{currency(item.lineTotal)}</td></tr>)}</tbody>
              </table>
            </div>
            <div className="mt-4 grid gap-2 text-sm md:grid-cols-4">
              <div>Subtotal: <b>{currency(viewOrder.subTotal || 0)}</b></div>
              <div>Discount: <b>{currency(viewOrder.discount || 0)}</b></div>
              <div>Taxable: <b>{currency(viewOrder.taxableAmount || 0)}</b></div>
              <div>GST: <b>{currency(viewOrder.gstTotal || 0)}</b></div>
              <div>Round Off: <b>{currency(viewOrder.roundOff || 0)}</b></div>
              <div>Grand Total: <b>{currency(viewOrder.grandTotal || viewOrder.total || 0)}</b></div>
              <div>Cancelled By: <b>{viewOrder.cancelledBy?.name || '-'}</b></div>
              <div>Cancelled At: <b>{dateTime(viewOrder.cancelledAt)}</b></div>
            </div>
            <div className="mt-4 rounded-md border border-slate-200 p-3 text-sm dark:border-slate-800">
              <b>Notes</b>
              <p className="mt-1 text-slate-600 dark:text-slate-300">{viewOrder.notes || '-'}</p>
              {viewOrder.cancellationReason ? <p className="mt-2 text-red-600">Cancellation reason: {viewOrder.cancellationReason}</p> : null}
            </div>
            <div className="mt-4">
              <h3 className="mb-2 font-semibold">Receiving History</h3>
              {(viewOrder.receivingHistory || []).length ? (
                <div className="space-y-2">
                  {viewOrder.receivingHistory.map((receipt) => (
                    <div key={receipt._id || receipt.receiptNo} className="rounded-md border border-slate-200 p-3 text-sm dark:border-slate-800">
                      <div className="flex flex-wrap justify-between gap-2"><b>{receipt.receiptNo}</b><span>{dateTime(receipt.receivedAt)} | {receipt.receivedBy?.name || '-'}</span></div>
                      <div className="mt-2 grid gap-1 md:grid-cols-2">{(receipt.items || []).map((item) => <span key={`${receipt.receiptNo}-${item.product}`}>{item.name}: <b>{item.quantity}</b> {item.unit} Free <b>{item.freeQuantity || 0}</b></span>)}</div>
                    </div>
                  ))}
                </div>
              ) : <p className="text-sm text-slate-500">No receiving history yet.</p>}
            </div>
          </div>
        </div>
      ) : null}

      {newProductTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="panel w-full max-w-2xl p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold">Add New Product</h2>
              <button type="button" className="btn-muted h-9 w-9 p-0" onClick={() => setNewProductTarget(null)}>
                <XCircle size={16} />
              </button>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <input className="input" placeholder="Product Name" value={newProductForm.name} onChange={(event) => setNewProductForm((current) => ({ ...current, name: event.target.value }))} autoFocus />
              <input className="input" placeholder="Local Language Name" value={newProductForm.localName} onChange={(event) => setNewProductForm((current) => ({ ...current, localName: event.target.value }))} />
              <select className="input" value={newProductForm.category} onChange={(event) => setNewProductForm((current) => ({ ...current, category: event.target.value }))}>
                <option value="">Select category</option>
                {categories.map((category) => <option key={category._id} value={category._id}>{category.name}</option>)}
              </select>
              <select className="input" value={newProductForm.unit} onChange={(event) => setNewProductForm((current) => ({ ...current, unit: event.target.value }))}>
                {units.map((unit) => <option key={unit._id} value={unit.name}>{unit.name}</option>)}
              </select>
              <input className="input" type="number" min="0" step="0.01" placeholder="GST %" value={newProductForm.taxRate} onChange={(event) => setNewProductForm((current) => ({ ...current, taxRate: event.target.value }))} />
              <input className="input" placeholder="Barcode (optional)" value={newProductForm.barcode} onChange={(event) => setNewProductForm((current) => ({ ...current, barcode: event.target.value }))} />
              <input className="input" placeholder="SKU (optional)" value={newProductForm.sku} onChange={(event) => setNewProductForm((current) => ({ ...current, sku: event.target.value }))} />
              <input className="input" type="number" min="0" step="0.01" placeholder="Default Cost" value={newProductForm.purchasePrice} onChange={(event) => setNewProductForm((current) => ({ ...current, purchasePrice: event.target.value }))} />
              <input className="input" type="number" min="0" step="0.01" placeholder="Default Selling Price" value={newProductForm.sellingPrice} onChange={(event) => setNewProductForm((current) => ({ ...current, sellingPrice: event.target.value }))} />
              <input className="input" type="number" min="0" step="0.001" placeholder="Opening Stock (optional)" value={newProductForm.stock} onChange={(event) => setNewProductForm((current) => ({ ...current, stock: event.target.value }))} />
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="btn-muted" onClick={() => setNewProductTarget(null)}>Cancel</button>
              <button type="button" className="btn-primary" disabled={savingProduct} onClick={saveNewProduct}>
                {savingProduct ? 'Saving...' : 'Save Product'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <TextInputDialog
        open={Boolean(convertTarget)}
        title="Convert Purchase Order"
        label="Invoice Number"
        value={convertInvoiceNumber}
        error={convertError}
        confirmLabel="Convert"
        busy={convertingOrder}
        readOnlyRows={[
          { label: 'Purchase Order Number', value: convertTarget?.poNumber },
          { label: 'Supplier Name', value: convertTarget?.supplier?.name }
        ]}
        onChange={(value) => {
          setConvertInvoiceNumber(value);
          if (value.trim()) setConvertError('');
        }}
        onCancel={() => {
          if (convertingOrder) return;
          setConvertTarget(null);
          setConvertInvoiceNumber('');
          setConvertError('');
        }}
        onConfirm={confirmConvertOrder}
      />

      <TextInputDialog
        open={Boolean(cancelTarget)}
        title="Cancel Purchase Order"
        label="Cancellation Reason"
        value={cancelReason}
        error={cancelError}
        confirmLabel="Cancel Order"
        busy={cancellingOrder}
        readOnlyRows={[
          { label: 'Purchase Order Number', value: cancelTarget?.poNumber },
          { label: 'Supplier Name', value: cancelTarget?.supplier?.name }
        ]}
        onChange={(value) => {
          setCancelReason(value);
          if (value.trim()) setCancelError('');
        }}
        onCancel={() => {
          if (!cancellingOrder) {
            setCancelTarget(null);
            setCancelReason('');
            setCancelError('');
          }
        }}
        onConfirm={confirmCancelOrder}
      />

      <ConfirmDialog
        open={Boolean(deletePurchaseTarget)}
        title="Delete Purchase"
        message={`Delete ${deletePurchaseTarget?.purchaseNo || deletePurchaseTarget?.invoiceNumber || 'this purchase'} and reverse its stock?`}
        confirmLabel="Delete Purchase"
        danger
        busy={deletingPurchase}
        onCancel={() => {
          if (!deletingPurchase) setDeletePurchaseTarget(null);
        }}
        onConfirm={confirmDeletePurchase}
      />

      {viewPurchase ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="panel max-h-[90vh] w-full max-w-3xl overflow-auto p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold">Purchase {viewPurchase.purchaseNo || viewPurchase.invoiceNumber}</h2>
                <p className="text-sm text-slate-500">{viewPurchase.supplier?.name || '-'} | {dateTime(viewPurchase.purchaseDate || viewPurchase.createdAt)}</p>
              </div>
              <button className="btn-muted h-9 w-9 p-0" onClick={() => setViewPurchase(null)}><XCircle size={16} /></button>
            </div>
            <div className="mt-4 table-shell">
              <table className="w-full">
                <thead><tr><th className="table-th">Product</th><th className="table-th">Qty</th><th className="table-th">Free</th><th className="table-th">GST</th><th className="table-th">Net</th></tr></thead>
                <tbody>{(viewPurchase.items || []).map((item, index) => <tr key={`${item.product}-${index}`}><td className="table-td">{item.name || item.product?.name}</td><td className="table-td">{item.quantity}</td><td className="table-td">{item.freeQuantity || 0}</td><td className="table-td">{item.gstRate || 0}%</td><td className="table-td">{currency(item.netAmount || item.lineTotal || 0)}</td></tr>)}</tbody>
              </table>
            </div>
            <div className="mt-4 grid gap-2 text-sm md:grid-cols-3">
              <div>Sub Total: <b>{currency(viewPurchase.subTotal || 0)}</b></div>
              <div>GST: <b>{currency(viewPurchase.gstTotal || 0)}</b></div>
              <div>Discount: <b>{currency(viewPurchase.discount || 0)}</b></div>
              <div>Freight: <b>{currency(viewPurchase.freightCharges || 0)}</b></div>
              <div>Round Off: <b>{currency(viewPurchase.roundOff || 0)}</b></div>
              <div>Grand Total: <b>{currency(viewPurchase.grandTotal || viewPurchase.total || 0)}</b></div>
              <div>Paid: <b>{currency(viewPurchase.amountPaid || viewPurchase.paidAmount || 0)}</b></div>
              <div>Balance: <b>{currency(viewPurchase.balance || 0)}</b></div>
              <div>Status: <b>{viewPurchase.paymentStatus || '-'}</b></div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
