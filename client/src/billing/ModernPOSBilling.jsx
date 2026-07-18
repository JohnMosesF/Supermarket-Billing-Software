import React, { useMemo, useState, useRef, useEffect } from 'react';
import BillingEntryRow from './BillingEntryRow.jsx';
import BillingTable from './BillingTable.jsx';
import BillingSummaryPanel from './BillingSummaryPanel.jsx';
import InvoicePreview from './InvoicePreview.jsx';
import HoldBillsModal from './HoldBillsModal.jsx';
import KeyboardManager from './KeyboardManager.js';
import { billingAPI, holdBillAPI, customerAPI, printLogAPI } from './billingService.js';
import { api } from '../api/http.js';
import { currency, dateTime } from '../utils/format.js';
import toast from 'react-hot-toast';
import { printInvoice, makeInvoiceHtmlFromSale } from '../utils/print';
import { normalizeBillItem } from '../utils/normalizeBillItem.js';
import { useAuthStore } from '../store/authStore.js';

const toCartItem = (item) => {
  const normalized = normalizeBillItem(item);
  return {
    ...item,
    ...normalized,
    _id: normalized.mongoId,
    name: normalized.productName,
    rate: normalized.price,
    qty: normalized.quantity,
    gst: normalized.gstRate,
    amount: normalized.netAmount
  };
};

const paymentAmount = (amountPaid, total, paymentMethod) => {
  const paid = Number(amountPaid);
  if (String(paymentMethod || '').trim().toLowerCase() === 'credit') {
    return Number.isFinite(paid) ? Math.max(paid, 0) : 0;
  }
  return Number.isFinite(paid) && paid > 0 ? paid : Number(total || 0);
};

const padTimePart = (value) => String(value).padStart(2, '0');

const currentInvoiceDateTime = () => {
  const now = new Date();
  return {
    date: now.toISOString().slice(0, 10),
    time: `${padTimePart(now.getHours())}:${padTimePart(now.getMinutes())}`
  };
};

const stableStringify = (value) => JSON.stringify(value, (key, val) => {
  if (!val || typeof val !== 'object' || Array.isArray(val)) return val;
  return Object.keys(val).sort().reduce((acc, itemKey) => {
    acc[itemKey] = val[itemKey];
    return acc;
  }, {});
});

const calculateCartLine = (item) => {
  const qty = Number(item.qty ?? item.quantity ?? 0);
  const rate = Number(item.rate ?? item.price ?? item.sellingPrice ?? 0);
  const gstRate = Number(item.gst ?? item.gstRate ?? item.taxRate ?? 0);
  const gross = qty * rate;
  const discountPercent = Number(item.discountPercent || 0);
  const explicitDiscount = Number(item.discount || 0);
  const discount = item.discountMode === 'percent' || (discountPercent > 0 && explicitDiscount <= 0)
    ? gross * discountPercent / 100
    : explicitDiscount;
  const taxableBase = Math.max(gross - discount, 0);
  const gstInclusive = Boolean(item.gstInclusive);
  const gstAmount = gstInclusive
    ? taxableBase - taxableBase / (1 + gstRate / 100)
    : taxableBase * gstRate / 100;
  const taxableAmount = gstInclusive ? taxableBase - gstAmount : taxableBase;
  const netAmount = gstInclusive ? taxableBase : taxableBase + gstAmount;
  return { qty, rate, gstRate, gross, discount, discountPercent, taxableAmount, gstAmount, netAmount };
};

const withCartLineTotals = (item) => {
  const line = calculateCartLine(item);
  return {
    ...item,
    qty: line.qty,
    quantity: line.qty,
    rate: line.rate,
    price: line.rate,
    gst: line.gstRate,
    gstRate: line.gstRate,
    discount: line.discount,
    discountPercent: line.discountPercent,
    taxableAmount: line.taxableAmount,
    amount: line.taxableAmount,
    gstAmount: line.gstAmount,
    netAmount: line.netAmount
  };
};

const toHeldCartItem = (item) => {
  const normalized = normalizeBillItem(item);
  const price = Number(item.price ?? item.rate ?? normalized.price ?? 0);
  const quantity = Number(item.quantity ?? item.qty ?? normalized.quantity ?? 0);
  const gstRate = Number(item.gstRate ?? item.gst ?? normalized.gstRate ?? 0);
  const netAmount = Number(item.netAmount ?? item.lineTotal ?? item.total ?? normalized.netAmount ?? 0);
  return {
    ...item,
    ...normalized,
    _id: normalized.mongoId || item.mongoId || item._id || item.productId,
    mongoId: normalized.mongoId || item.mongoId || item._id || '',
    productId: normalized.productId || item.productIdNumber || item.productIdValue || item.productId || '',
    productName: item.productName || item.name || normalized.productName,
    name: item.productName || item.name || normalized.productName,
    localName: item.localName || normalized.localName,
    sku: item.sku || normalized.sku,
    barcode: item.barcode || normalized.barcode,
    hsnCode: item.hsnCode || item.hsn || normalized.hsnCode,
    unit: item.unit || normalized.unit || 'pcs',
    qty: quantity,
    quantity,
    freeQuantity: Number(item.freeQuantity || 0),
    rate: Number(item.rate ?? price),
    price,
    sellingPrice: Number(item.sellingPrice ?? price),
    wholesalePrice: Number(item.wholesalePrice ?? normalized.wholesalePrice ?? 0),
    mrp: Number(item.mrp ?? normalized.mrp ?? 0),
    priceMode: item.priceMode || normalized.priceMode || 'retail',
    discount: Number(item.discount ?? item.discountAmount ?? normalized.discount ?? 0),
    discountPercent: Number(item.discountPercent ?? normalized.discountPercent ?? 0),
    gst: gstRate,
    gstRate,
    gstAmount: Number(item.gstAmount ?? normalized.gstAmount ?? 0),
    gstInclusive: Boolean(item.gstInclusive ?? normalized.gstInclusive),
    taxableAmount: Number(item.taxableAmount ?? item.amount ?? normalized.taxableAmount ?? 0),
    amount: Number(item.amount ?? item.taxableAmount ?? normalized.taxableAmount ?? 0),
    lineTotal: Number(item.lineTotal ?? netAmount),
    netAmount,
    total: Number(item.total ?? netAmount),
    batch: item.batch || '',
    expiry: item.expiry || '',
    remarks: item.remarks || '',
    stock: Number(item.stock ?? item.stockAtSale ?? normalized.stockAtSale ?? 0),
    stockAtSale: Number(item.stockAtSale ?? item.stock ?? normalized.stockAtSale ?? 0)
  };
};

/**
 * ModernPOSBilling - Complete keyboard-first billing interface
 * 
 * WORKFLOW:
 * 1. Product ID/Name Entry -> Add to Cart
 * 2. Customer Name (Optional)
 * 3. Review Cart with Live Preview
 * 4. Save/Hold/Print with Shortcuts
 * 
 * KEYBOARD SHORTCUTS:
 * - Ctrl+F: Focus Product ID
 * - F1: New Bill
 * - F3: Focus Customer Name  
 * - F4/Ctrl+H: Hold Bill
 * - F8/Ctrl+P: Print
 * - Ctrl+S: Save Bill
 * - ESC: Clear Entry Row
 * - Delete/Ctrl+Delete: Remove Selected Item
 */
export default function ModernPOSBilling() {

  const user = useAuthStore((state) => state.user);
  const canEditPrice = user?.role === 'admin' || user?.role === 'manager' || (user?.permissions || []).includes('billing_price_override');
  const params = getQueryParams();
  const windowId = params.get('windowId');
  // Cart state
  const [cart, setCart] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [editingCartIndex, setEditingCartIndex] = useState(null);

  useEffect(() => {
    console.log("Selected Index:", selectedIndex);
  }, [selectedIndex]);
  
  // Customer and payment info
  const [customerName, setCustomerName] = useState('');
  const [customerMobile, setCustomerMobile] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [discountPercent, setDiscountPercent] = useState(0);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [customerSuggestions, setCustomerSuggestions] = useState([]);
  const [allCustomers, setAllCustomers] = useState([]);
  const [filteredCustomers, setFilteredCustomers] = useState([]);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [customerSuggestionIndex, setCustomerSuggestionIndex] = useState(-1);
  const [customerSearchLoading, setCustomerSearchLoading] = useState(false);
  const [amountPaid, setAmountPaid] = useState(0);
  const [cashReceived, setCashReceived] = useState('');
  const [splitPayments, setSplitPayments] = useState([
    { method: 'cash', amount: '', reference: '' },
    { method: 'upi', amount: '', reference: '' },
    { method: 'card', amount: '', reference: '' }
  ]);
  
  // UI state
  const [showHoldBillsModal, setShowHoldBillsModal] = useState(false);
  const [showInvoicePreview, setShowInvoicePreview] = useState(false);
  
  // Invoice date/time (editable)
  const initialInvoiceDateTime = useMemo(() => currentInvoiceDateTime(), []);
  const [invoiceDate, setInvoiceDate] = useState(initialInvoiceDateTime.date);
  const [invoiceTime, setInvoiceTime] = useState(initialInvoiceDateTime.time);
  const [resumedHoldId, setResumedHoldId] = useState(null);
  const [heldSnapshot, setHeldSnapshot] = useState(null);
  const [holdSnapshotDirty, setHoldSnapshotDirty] = useState(false);
  const [resumedHoldMeta, setResumedHoldMeta] = useState(null);
  const [showDiscardHoldDialog, setShowDiscardHoldDialog] = useState(false);
  const [invoiceTimestampEdited, setInvoiceTimestampEdited] = useState(false);
  const [settings, setSettings] = useState(null);
  const [isEditingBill, setIsEditingBill] = useState(false);
  const [editingBillId, setEditingBillId] = useState(null);
  const [editingInvoiceNumber, setEditingInvoiceNumber] = useState('');
  const [invoiceMode, setInvoiceMode] = useState('new');
  const [loadedBill, setLoadedBill] = useState(null);
  const [pendingAutoPrint, setPendingAutoPrint] = useState(false);
  const isReadOnly = invoiceMode === 'view';

  useEffect(() => {
    api.get('/settings', { silent: true }).then((res) => setSettings(res.data.settings)).catch(() => {});
  }, []);

  // Keep untouched new invoices near the system clock without overwriting manual edits.
  useEffect(() => {
    const id = setInterval(() => {
      if (invoiceMode !== 'new' || invoiceTimestampEdited) return;
      const current = currentInvoiceDateTime();
      setInvoiceDate((date) => (date === current.date ? date : current.date));
      setInvoiceTime((time) => (time === current.time ? time : current.time));
    }, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [invoiceMode, invoiceTimestampEdited]);
  

  // Refs
  const entryRef = useRef(null);
  const customerNameRef = useRef(null);
  const customerMobileRef = useRef(null);
  const paymentMethodRef = useRef(null);
  const discountPercentRef = useRef(null);
  const amountPaidRef = useRef(null);
  const cashReceivedRef = useRef(null);
  const saveBillButtonRef = useRef(null);
  const customerDropdownRef = useRef(null);
  const kmRef = useRef(null);
  const actionsRef = useRef({});
  const latestCartLenRef = useRef(0);
  const removeSelectedRef = useRef(() => {});
  const handleSaveRef = useRef(() => {});
  const handleHoldRef = useRef(() => {});
  const handlePrintRef = useRef(() => {});
  const handleNewBillRef = useRef(() => {});
  const handleResumeRef = useRef(() => {});
  const holdBaselineRef = useRef('');

  /**
   * Initialize keyboard shortcuts
   */
  // KeyboardManager setup moved below after handler definitions to avoid TDZ

  // Listen for resume payload sent from main window (electron)
  function getQueryParams() {
      const hash = window.location.hash;

      if (hash.includes("?")) {
          return new URLSearchParams(hash.substring(hash.indexOf("?")));
      }

      return new URLSearchParams(window.location.search);
  }

  const makeHoldFingerprintFromState = (state) => stableStringify({
    invoiceDate: state.invoiceDate,
    invoiceTime: state.invoiceTime,
    customerName: String(state.customerName || '').trim(),
    customerMobile: String(state.customerMobile || '').trim(),
    paymentMethod: normalizePaymentMode(state.paymentMethod),
    discountPercent: Number(state.discountPercent || 0),
    discountAmount: Number(state.discountAmount || 0),
    amountPaid: Number(state.amountPaid || 0),
    cashReceived: String(state.cashReceived || ''),
    splitPayments: (state.splitPayments || []).map((entry) => ({
      method: normalizePaymentMode(entry.method),
      amount: String(entry.amount || ''),
      reference: String(entry.reference || '')
    })),
    cart: (state.cart || []).map((item) => ({
      productId: String(item.mongoId || item._id || item.productId || ''),
      productIdNumber: item.productIdNumber ?? item.productId,
      productName: item.productName || item.name || '',
      qty: Number(item.qty ?? item.quantity ?? 0),
      price: Number(item.price ?? item.rate ?? item.sellingPrice ?? 0),
      discount: Number(item.discount || 0),
      discountPercent: Number(item.discountPercent || 0),
      gst: Number(item.gst ?? item.gstRate ?? 0),
      gstInclusive: Boolean(item.gstInclusive),
      remarks: item.remarks || '',
      batch: item.batch || '',
      expiry: item.expiry || ''
    }))
  });

  const makeHoldWorkingCopyFingerprint = () => makeHoldFingerprintFromState({
    invoiceDate,
    invoiceTime,
    customerName,
    customerMobile,
    paymentMethod,
    discountPercent,
    discountAmount,
    amountPaid,
    cashReceived,
    splitPayments,
    cart
  });

  const resumedHoldHasUnsavedChanges = () => {
    if (!resumedHoldId) return false;
    return holdBaselineRef.current !== makeHoldWorkingCopyFingerprint();
  };

  const hasCartItems = cart.some(
    item => Number(item.qty || item.quantity || 0) > 0
  );
  const hasUnsavedChanges = invoiceMode === 'hold'
    ? resumedHoldHasUnsavedChanges()
    : hasCartItems && invoiceMode !== 'view';

  useEffect(() => {
    console.log("Window ID:", windowId);

    if (window.electronAPI?.sendBillingEvent && windowId) {
      window.electronAPI.sendBillingEvent(
        `billing-cart-state-${windowId}`,
        hasUnsavedChanges
      );
    }
  }, [hasUnsavedChanges, windowId]);

  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (!hasUnsavedChanges) return;

      e.preventDefault();
      e.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [hasUnsavedChanges]);

  useEffect(() => {
    if (window?.electronAPI?.onBillingEvent) {
      const handler = (data) => {
        console.log('Resume payload received in billing window', data);
        if (data) handleResumeHeldBill(data);
      };
      window.electronAPI.onBillingEvent('resume-bill', handler);
      return () => {};
    }
  }, [cart]);

  useEffect(() => {
    if (!window?.electronAPI?.onBillingEvent) return undefined;
    return window.electronAPI.onBillingEvent('load-invoice', (payload) => {
      if (payload?.bill) {
        loadHistoricalInvoice(payload.bill, payload.mode);
        setPendingAutoPrint(Boolean(payload.autoPrint));
      }
    });
  }, []);

  useEffect(() => {
    const loadCustomers = async () => {
      try {
        const res = await customerAPI.getCustomers({
          page: 1,
          limit: 10000,
        });

        const customers = res.data?.customers || [];

        setAllCustomers(customers);
        setFilteredCustomers(customers);
      } catch (err) {
        console.error("Failed to load customers", err);
      }
    };

    loadCustomers();
  }, []);

  useEffect(() => {
    if (!showCustomerDropdown) return;

    const handleClickOutside = (event) => {
      if (
        customerDropdownRef.current &&
        !customerDropdownRef.current.contains(event.target)
      ) {
        setShowCustomerDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showCustomerDropdown]);

  useEffect(() => {
    const query = customerName.trim();

    if (!query) {
        setFilteredCustomers(allCustomers);
        setCustomerSuggestions([]);
        return;
    }

    const filtered = allCustomers.filter(customer =>
        customer.name?.toLowerCase().includes(query.toLowerCase()) ||
        customer.mobile?.includes(query)
    );

    setFilteredCustomers(filtered);

    const timer = setTimeout(() => {
        searchCustomers(query);
    }, 250);

    return () => clearTimeout(timer);

}, [customerName, allCustomers]);

  const selectCustomerSuggestion = (customer) => {
      markHoldWorkingCopyChanged();
      setCustomerName(customer.name || '');
      setCustomerMobile(customer.mobile || '');
      setCustomerSuggestions([]);
      setCustomerSuggestionIndex(-1);
      setShowCustomerDropdown(false);
      customerMobileRef.current?.focus();
  };

  const searchCustomers = async (query) => {
    const trimmed = String(query || '').trim();
    if (!trimmed) {
      setCustomerSuggestions([]);
      setCustomerSearchLoading(false);
      return;
    }

    setCustomerSearchLoading(true);
    try {
      const { data } = await customerAPI.searchCustomers(trimmed);
      setCustomerSuggestions((data?.customers || []).slice(0, 10));
    } catch (err) {
      console.error('Customer search failed', err);
      setCustomerSuggestions([]);
    } finally {
      setCustomerSearchLoading(false);
    }
  };

  function normalizePaymentMode(value) {
    const normalized = String(value || 'cash').trim().toLowerCase();
    if (normalized === 'upi') return 'upi';
    if (normalized === 'card') return 'card';
    if (normalized === 'bank' || normalized === 'bank_transfer') return 'bank_transfer';
    if (normalized === 'bank transfer') return 'bank_transfer';
    if (normalized === 'credit') return 'credit';
    if (normalized === 'cheque') return 'cheque';
    if (normalized === 'wallet') return 'wallet';
    if (normalized === 'split') return 'split';
    if (normalized === 'online') return 'online';
    return 'cash';
  };

  const resetPaymentState = () => {
    setPaymentMethod('cash');
    setAmountPaid(0);
    setCashReceived('');
    setSplitPayments([
      { method: 'cash', amount: '', reference: '' },
      { method: 'upi', amount: '', reference: '' },
      { method: 'card', amount: '', reference: '' }
    ]);
  }

  const resetInvoiceTimestamp = () => {
    const current = currentInvoiceDateTime();
    setInvoiceDate(current.date);
    setInvoiceTime(current.time);
    setInvoiceTimestampEdited(false);
  };

  const resetBillingStateForNextInvoice = ({ showToast = false } = {}) => {
    setCart([]);
    setCustomerName('');
    setCustomerMobile('');
    setDiscountPercent(0);
    setDiscountAmount(0);
    resetPaymentState();
    setSelectedIndex(-1);
    setEditingCartIndex(null);
    setResumedHoldId(null);
    setHeldSnapshot(null);
    setResumedHoldMeta(null);
    holdBaselineRef.current = '';
    setHoldSnapshotDirty(false);
    setIsEditingBill(false);
    setEditingBillId(null);
    setEditingInvoiceNumber('');
    setInvoiceMode('new');
    setLoadedBill(null);
    resetInvoiceTimestamp();
    setTimeout(() => entryRef.current?.focusProductId(), 50);
    if (showToast) toast('New bill started');
  };

  const markHoldWorkingCopyChanged = () => {
    if (invoiceMode === 'hold') setHoldSnapshotDirty(true);
  };

  const normalizedSplitPayments = (splitPayments || [])
    .map((entry) => ({
      method: normalizePaymentMode(entry.method),
      amount: Number(entry.amount || 0),
      reference: String(entry.reference || '').trim()
    }))
    .filter((entry) => Number.isFinite(entry.amount) && entry.amount > 0);

  const splitPaidAmount = normalizedSplitPayments.reduce((sum, entry) => sum + entry.amount, 0);

  const updateSplitPayment = (index, patch) => {
    markHoldWorkingCopyChanged();
    setSplitPayments((prev) => prev.map((entry, i) => i === index ? { ...entry, ...patch } : entry));
  };

  const addSplitPaymentRow = () => {
    markHoldWorkingCopyChanged();
    setSplitPayments((prev) => [...prev, { method: 'cash', amount: '', reference: '' }]);
  };

  const removeSplitPaymentRow = (index) => {
    markHoldWorkingCopyChanged();
    setSplitPayments((prev) => prev.length <= 1 ? prev : prev.filter((_, i) => i !== index));
  };

  const ensureCustomerProfile = async () => {
    const mobile = customerMobile?.trim();
    const name = customerName?.trim() || 'Walk-in Customer';
    if (!mobile) return;

    try {
      const res = await customerAPI.searchCustomers(mobile);
      const existing = (res.data?.customers || []).find((c) => String(c.mobile || '').trim() === mobile);
      if (!existing) {
        await customerAPI.createCustomer({ name, mobile });
        toast.success('Customer profile saved for future checkout');
      }
    } catch (err) {
      console.debug('Customer auto-save skipped', err?.message || err);
    }
  };

  /**
   * Add item to cart or update quantity if already exists
   */
  const handleAddItem = (item) => {
    setHoldSnapshotDirty(true);
    if (editingCartIndex != null) {
      setCart((prev) => prev.map((row, index) => index === editingCartIndex ? withCartLineTotals(item) : row));
      setSelectedIndex(editingCartIndex);
      setEditingCartIndex(null);
      toast.success('Item updated');
      entryRef.current?.focusProductId();
      return;
    }

    setCart((prev) => {
      const productId = item.productId || item._id || item.name;
      // Merge only if same product AND same selling price
      const existing = prev.findIndex((r) => (r.productId || r._id || r.name) === productId && Number(r.rate || r.price || r.sellingPrice || 0) === Number(item.rate || item.price || item.sellingPrice || 0));

      if (existing >= 0) {
        // Item exists with same price, update quantity
        const copy = [...prev];
        const current = copy[existing];
        
        const nextQty = Number(current.qty ?? current.quantity ?? 0) + Number(item.qty ?? item.quantity ?? 0);
        const availableStock = Number(current.stock ?? item.stock ?? 0);

        if (
          !item.allowNegativeStock &&
          availableStock > 0 &&
          nextQty > availableStock
        ) {
          toast.error(
              `Only ${availableStock} ${current.unit || ""} available in stock`
          );

          return prev;
        }
        copy[existing] = withCartLineTotals({
          ...current,
          qty: nextQty,
          quantity: nextQty
        });
        return copy;
      }
      const availableStock = Number(item.stock ?? 0);

      if (
          !item.allowNegativeStock &&
          availableStock > 0 &&
          Number(item.qty) > availableStock
      ) {
          toast.error(
              `Only ${availableStock} ${item.unit || ""} available in stock`
          );

          return prev;
      }

      // New item (different product or different price)
      return [...prev, withCartLineTotals(item)];
    });
    
    toast.success('Item added');
    entryRef.current?.focusProductId();
  };

  /**
   * Remove selected item from cart
   */
  const removeSelectedItem = () => {
    if (selectedIndex < 0 || cart.length === 0) {
      toast.error('No item selected');
      return;
    }
    
    setCart((prev) => prev.filter((_, i) => i !== selectedIndex));
    setSelectedIndex(-1);
    setEditingCartIndex(null);
    setHoldSnapshotDirty(true);
    toast.success('Item removed');
    // return focus to product entry and ensure totals refresh
    setTimeout(() => entryRef.current?.focusProductId(), 50);
  };

  /**
   * Update item in cart
   */
  const updateItem = (index, patch) => {
    setHoldSnapshotDirty(true);
    setCart((prev) => {
      const copy = [...prev];
      if (!copy[index]) return prev;
      copy[index] = withCartLineTotals({ ...copy[index], ...patch });
      return copy;
    });
  };

  const editCartItem = (index) => {
    if (isReadOnly) return;
    const item = cart[index];
    if (!item) return;
    setSelectedIndex(index);
    setEditingCartIndex(index);
    entryRef.current?.loadCartItem?.(item);
  };

  const cancelCartEdit = () => {
    setEditingCartIndex(null);
    entryRef.current?.focusProductId?.();
  };

  const duplicateItem = (index) => {
    setHoldSnapshotDirty(true);
    setCart((prev) => {
      const source = prev[index];
      if (!source) return prev;
      const copy = [...prev];
      copy.splice(index + 1, 0, withCartLineTotals({ ...source }));
      return copy;
    });
    setSelectedIndex(index + 1);
  };

  const moveItem = (index, direction) => {
    setHoldSnapshotDirty(true);
    setCart((prev) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= prev.length) return prev;
      const copy = [...prev];
      const [item] = copy.splice(index, 1);
      copy.splice(nextIndex, 0, item);
      return copy;
    });
    setSelectedIndex((prev) => {
      const next = prev + direction;
      return Math.max(0, Math.min(cart.length - 1, next));
    });
  };

  const clearCart = () => {
    if (!cart.length) return;
    if (!window.confirm('Clear all cart items?')) return;
    setCart([]);
    setSelectedIndex(-1);
    setHeldSnapshot(null);
    setHoldSnapshotDirty(Boolean(resumedHoldId));
    entryRef.current?.focusProductId();
  };

  /**
   * Create bill payload
   */
  const makeBillPayload = () => {
    if (cart.length === 0) {
      throw new Error('Cart is empty');
    }

    const lineTotals = cart.map(calculateCartLine);
    const subtotal = lineTotals.reduce((sum, line) => sum + line.taxableAmount, 0);
    const taxTotal = lineTotals.reduce((sum, line) => sum + line.gstAmount, 0);
    const itemDiscountTotal = lineTotals.reduce((sum, line) => sum + line.discount, 0);
    const billPercentDiscount = (subtotal * Number(discountPercent || 0)) / 100;
    const billAmountDiscount = Number(discountAmount || 0);
    const discount = itemDiscountTotal + billPercentDiscount + billAmountDiscount;
    const computedTotal = Math.max(subtotal + taxTotal - billPercentDiscount - billAmountDiscount, 0);
    const snapshotTotals = resumedHoldId && heldSnapshot?.totals && !holdSnapshotDirty ? heldSnapshot.totals : null;
    const payloadSubtotal = snapshotTotals ? Number(snapshotTotals.subtotal || 0) : subtotal;
    const payloadTaxTotal = snapshotTotals ? Number(snapshotTotals.taxTotal ?? snapshotTotals.gst ?? 0) : taxTotal;
    const payloadDiscount = snapshotTotals ? Number(snapshotTotals.discount || 0) : discount;
    const payloadDiscountPercent = snapshotTotals ? Number(snapshotTotals.discountPercent || 0) : Number(discountPercent || 0);
    const payloadDiscountAmount = snapshotTotals ? Number(snapshotTotals.discountAmount || 0) : billAmountDiscount;
    const total = snapshotTotals ? Number(snapshotTotals.total ?? snapshotTotals.billTotal ?? computedTotal) : computedTotal;
    const normalizedPaymentMethod = normalizePaymentMode(paymentMethod);

    /**
     * CRITICAL: Map cart items to server-expected format
     * Server expects: { _id (or productId), productName, quantity, price, gst, total }
     * where _id or productId is MongoDB ObjectId
     */
    const items = cart.map((it) => {
      const normalized = normalizeBillItem(it);
      const pid = normalized.mongoId;
      if (!pid) {
        throw new Error(`Cart item missing MongoDB ObjectId: ${JSON.stringify(it)}`);
      }
      return {
        ...normalized,
        _id: pid,
        productId: pid,
        productIdNumber: normalized.productId,
        mongoId: undefined,
        gst: normalized.gstRate,
        gstRate: normalized.gstRate,
        discount: normalized.discount,
        discountPercent: normalized.discountPercent,
        gstInclusive: normalized.gstInclusive,
        total: normalized.netAmount
      };
    });

    const snapshotPayment = resumedHoldId && heldSnapshot?.payment && !holdSnapshotDirty ? heldSnapshot.payment : null;
    const paidAmount = snapshotPayment
      ? Number(snapshotPayment.paidAmount ?? snapshotPayment.amountPaid ?? 0)
      : normalizedPaymentMethod === 'split'
      ? splitPaidAmount
      : normalizedPaymentMethod === 'cash'
        ? total
        : paymentAmount(amountPaid, total, paymentMethod);
    const balanceAmount = snapshotPayment ? Number(snapshotPayment.balanceAmount ?? snapshotPayment.balanceDue ?? snapshotPayment.outstanding ?? Math.max(0, total - paidAmount)) : Math.max(0, total - paidAmount);

    const payload = {
      items,
      subtotal: payloadSubtotal,
      taxTotal: payloadTaxTotal,
      discount: payloadDiscount,
      discountPercent: payloadDiscountPercent,
      discountAmount: payloadDiscountAmount,
      total,

      paymentMethod: paymentMethod || 'Cash',
      paymentDetails: snapshotPayment?.paymentDetails?.length
        ? snapshotPayment.paymentDetails
        : normalizedPaymentMethod === 'split'
        ? normalizedSplitPayments
        : [{ method: normalizedPaymentMethod, amount: paidAmount, reference: '' }],
      invoiceNo: invoiceMode === 'hold' ? undefined : editingInvoiceNumber || undefined,
      invoiceNumber: invoiceMode === 'hold' ? undefined : editingInvoiceNumber || undefined,

      customerName: customerName || 'Walk-in Customer',
      customerMobile: customerMobile || null,

      amountPaid: paidAmount,
      paidAmount,
      cashReceived: snapshotPayment ? Number(snapshotPayment.cashReceived || 0) : normalizedPaymentMethod === 'cash' ? Number(cashReceived || total) : 0,
      changeReturn: snapshotPayment ? Number(snapshotPayment.changeReturn || 0) : normalizedPaymentMethod === 'cash' ? Math.max(Number(cashReceived || total) - total, 0) : 0,

      balanceDue: balanceAmount,
      balanceAmount,

      paymentStatus:
        balanceAmount > 0
          ? 'PARTIAL'
          : 'PAID'
    };
    // include editable invoice date/time
    try {
      const at = new Date(`${invoiceDate}T${invoiceTime}`);
      if (!isNaN(at.getTime())) payload.invoiceAt = at.toISOString();
    } catch (e) {}

    return payload;
  };

  const makeHoldPayload = () => {
    const payload = makeBillPayload();
    const holdReferenceNo = resumedHoldMeta?.invoiceNo || resumedHoldMeta?.holdNo || editingInvoiceNumber || null;
    const snapshotTotals = {
      subtotal: payload.subtotal,
      taxTotal: payload.taxTotal,
      gst: payload.taxTotal,
      cgst: payload.cgst || 0,
      sgst: payload.sgst || 0,
      igst: payload.igst || 0,
      discount: payload.discount,
      discountPercent: payload.discountPercent,
      discountAmount: payload.discountAmount,
      roundOff: payload.roundOff || 0,
      total: payload.total,
      billTotal: payload.total,
      netTotal: payload.total,
      totalQuantity: cart.reduce((sum, item) => sum + Number(item.qty ?? item.quantity ?? 0), 0),
      totalItems: cart.length
    };
    const snapshotPayment = {
      method: normalizePaymentMode(payload.paymentMethod),
      paymentMethod: payload.paymentMethod,
      paymentDetails: payload.paymentDetails,
      splitPayments: normalizedSplitPayments,
      cashReceived: payload.cashReceived,
      amountPaid: payload.amountPaid,
      paidAmount: payload.paidAmount,
      balance: payload.balanceAmount,
      balanceAmount: payload.balanceAmount,
      balanceDue: payload.balanceDue,
      outstanding: payload.balanceAmount,
      changeReturn: payload.changeReturn,
      creditAmount: normalizePaymentMode(payload.paymentMethod) === 'credit' ? payload.balanceAmount : 0,
      partialPayment: payload.balanceAmount > 0
    };
    const snapshot = {
      invoice: {
        invoiceNo: holdReferenceNo,
        invoiceNumber: holdReferenceNo,
        invoiceAt: payload.invoiceAt,
        mode: invoiceMode
      },
      customer: {
        ...(heldSnapshot?.customer || {}),
        name: customerName || 'Walk-in Customer',
        mobile: customerMobile || '',
        phone: heldSnapshot?.customer?.phone || customerMobile || ''
      },
      cart: cart.map((item) => ({ ...item })),
      totals: snapshotTotals,
      payment: snapshotPayment,
      settings: settings || {},
      uiState: {
        selectedIndex,
        editingCartIndex,
        invoiceMode,
        resumedHoldId
      },
      metadata: {
        source: 'modern-pos',
        heldAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        windowId
      }
    };
    return {
      ...payload,
      invoiceNo: holdReferenceNo,
      invoiceNumber: holdReferenceNo,
      snapshot,
      invoice: snapshot.invoice,
      customer: snapshot.customer,
      cart: snapshot.cart,
      totals: snapshotTotals,
      payment: snapshotPayment,
      settings: snapshot.settings,
      uiState: snapshot.uiState,
      metadata: snapshot.metadata
    };
  };

  const validateCurrentBill = (payload) => {
    if (!payload.items.length) return 'Cart is empty';
    for (const item of payload.items) {
      if (Number(item.quantity || 0) <= 0) return `${item.productName || 'Item'} has zero quantity`;
      if (Number(item.price || 0) <= 0) return `${item.productName || 'Item'} has zero price`;
      if (Number(item.discount || 0) < 0) return `${item.productName || 'Item'} has invalid discount`;
      if (Number(item.gst || 0) < 0) return `${item.productName || 'Item'} has invalid GST`;
    }
    if (payload.total <= 0) return 'Bill total must be greater than zero';
    const mode = normalizePaymentMode(payload.paymentMethod);
    if (mode === 'cash' && cashReceived !== '' && Number(cashReceived || 0) < payload.total) {
      return 'Cash received cannot be less than invoice total';
    }
    if (mode === 'credit') {
      if (!String(customerMobile || '').trim()) return 'Customer mobile is required for credit bills';
      if (Number(payload.paidAmount || 0) > payload.total) return 'Amount paid cannot exceed invoice total';
    } else if (mode === 'split') {
      if (!payload.paymentDetails.length) return 'Add at least one split payment';
      if (Math.abs(Number(payload.paidAmount || 0) - Number(payload.total || 0)) > 0.01) {
        return 'Split payment total must equal invoice total';
      }
    } else if (Number(payload.paidAmount || 0) + 0.01 < Number(payload.total || 0)) {
      return 'Payment amount must equal invoice total';
    }
    return '';
  };

  /**
   * Save bill to database
   */
  const handleSave = async ({ clearAfterSave = true } = {}) => {
    try {
      if (cart.length === 0) {
        toast.error('Cart is empty');
        return;
      }

      const payload = makeBillPayload();
      const validationError = validateCurrentBill(payload);
      if (validationError) {
        toast.error(validationError);
        return;
      }
      
      // DEBUG: Log final payload before saving
      console.log('Final Bill Payload:', {
        itemCount: payload.items.length,
        items: payload.items.map(it => ({
          productId: it.productId,
          productName: it.productName,
          quantity: it.quantity,
          price: it.price,
          gst: it.gst
        })),
        subtotal: payload.subtotal,
        total: payload.total
      });

      // Verify all items have valid ObjectId
      const invalidItems = payload.items.filter(it => !it.productId);
      if (invalidItems.length > 0) {
        toast.error('Cart has items with invalid product references');
        console.error('Invalid items:', invalidItems);
        return;
      }
      
      const response = isEditingBill && editingBillId
        ? await billingAPI.updateBill(editingBillId, payload)
        : await billingAPI.createBill(payload);
      await ensureCustomerProfile();
      toast.success(isEditingBill ? 'Bill updated successfully' : 'Bill saved successfully');
      console.log('Save successful', { invoiceNo: payload.invoiceNo, items: payload.items.length });
      // delete old held bill if we resumed from one
      if (resumedHoldId) {
        try {
          await holdBillAPI.deleteHeldBill(resumedHoldId);
          console.log('Deleted held bill after save:', resumedHoldId);
          setResumedHoldId(null);
          setHeldSnapshot(null);
          setResumedHoldMeta(null);
          holdBaselineRef.current = '';
          setHoldSnapshotDirty(false);
        } catch (e) {
          console.error('Failed to delete held bill after save', e);
        }
      }
      if(clearAfterSave) {
        resetBillingStateForNextInvoice();
      }
      return response.data;
    } catch (err) {
      console.error('Save bill error:', err);
      toast.error(err.response?.data?.message || 'Failed to save bill');
      return null;
    }
  };

  /**
   * Hold bill for later
   */
  const handleHold = async () => {
    try {
      if (cart.length === 0) {
        toast.error('Cart is empty');
        return;
      }

      const payload = makeHoldPayload();
      const validationError = validateCurrentBill(payload);
      if (validationError) {
        toast.error(validationError);
        return;
      }
      console.log(resumedHoldId ? 'Updating held bill payload' : 'Holding bill payload', payload);

      if (resumedHoldId) {
        await holdBillAPI.updateHeldBill(resumedHoldId, payload);
        toast.success('Hold Bill Updated Successfully');
      } else {
        await holdBillAPI.holdBill(payload);
        toast.success('Bill held successfully');
      }

      resetBillingStateForNextInvoice();
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.message || 'Failed to hold bill');
    }
  };

  /**
   * Print current bill
   */
  const handlePrint = async (paperWidth) => {
    if (cart.length === 0) {
      toast.error('Cart is empty');
      return;
    }

    try {
      let saleToPrint;
      const savedDuringPrint = invoiceMode === 'new' || invoiceMode === 'hold';
      if (savedDuringPrint) {
        const saved = await handleSave({ clearAfterSave: false });
        if (!saved) return;
        saleToPrint = saved.bill || saved.sale || saved;
      } else if (invoiceMode === 'view') {
        saleToPrint = loadedBill;
      } else {
        saleToPrint = { ...loadedBill, ...makeBillPayload(), _id: editingBillId };
      }
      console.log("SALE TO PRINT", saleToPrint);
      console.log("SALE ITEMS", saleToPrint.items);

      console.log("SALE TO PRINT", saleToPrint);

      const printSettings = { ...(settings || {}), ...(paperWidth ? { receiptWidth: paperWidth } : {}) };
      const html = makeInvoiceHtmlFromSale(saleToPrint, printSettings);

      console.log("HTML LENGTH", html.length);
      console.log(html);

      if (!html || html.trim().length < 50) {
        toast.error('Invoice preview is empty. Nothing was printed.');
        if (savedDuringPrint) {
          loadHistoricalInvoice(saleToPrint, 'view');
        }
        return;
      }

      const result = await printInvoice(html, {
        silent: settings?.silentPrinting !== false,
        printBackground: true,
        copies: Number(settings?.numberOfCopies || 1),
        deviceName: settings?.printerName || undefined,
       
        paperWidth:
          paperWidth || settings?.receiptWidth ||
          settings?.thermalPaperWidth ||
          "80mm",

        meta: {
          storeName: settings?.storeName,
          gst: settings?.gstNumber,
          invoiceNo: saleToPrint.invoiceNumber,
          date: saleToPrint.invoiceAt,

          paperWidth:
            paperWidth || settings?.receiptWidth ||
            settings?.thermalPaperWidth ||
            "80mm"
        }
      });
      console.log("PRINT RESULT", result);

      if (!result?.ok) {
          toast.error(`Printing failed: ${result?.error || 'Unknown printer error'}`);
          await printLogAPI.logPrint({
            invoiceNo: saleToPrint.invoiceNo || saleToPrint.invoiceNumber || 'AUTO',
            printer: settings?.printerName || 'default',
            paperWidth: paperWidth || settings?.receiptWidth || settings?.thermalPaperWidth || '80mm',
            success: false,
            error: result?.error || 'Unknown printer error',
            duplicateCopy: !savedDuringPrint
          }).catch(() => {});
          if (savedDuringPrint) {
            loadHistoricalInvoice(saleToPrint, 'view');
          }
          return;
      }

      await printLogAPI.logPrint({
        invoiceNo: saleToPrint.invoiceNo || saleToPrint.invoiceNumber || 'AUTO',
        printer: settings?.printerName || 'default',
        paperWidth: paperWidth || settings?.receiptWidth || settings?.thermalPaperWidth || '80mm',
        success: true,
        duplicateCopy: !savedDuringPrint
      }).catch(() => {});

      if (savedDuringPrint) resetBillingStateForNextInvoice();

      toast.success('Invoice sent to printer');
    } catch (err) {
      console.error('Print bill error:', err);
      toast.error(err.response?.data?.message || err.message || 'Failed to print invoice');
    }
  };

  /**
   * Start new bill
   */
  const handleNewBill = async () => {
    if (cart.length > 0) {
      const confirmed = window.confirm('Clear current bill and start new?');
      if (!confirmed) return;
    }
    resetBillingStateForNextInvoice({ showToast: true });
  };

  const closeBillingWindow = () => {
    if (window.electronAPI?.sendBillingEvent && windowId) {
      window.electronAPI.sendBillingEvent(`billing-cart-state-${windowId}`, false);
    }
    window.close();
  };

  const handleCloseBill = () => {
    if (invoiceMode === 'hold' && resumedHoldId && resumedHoldHasUnsavedChanges()) {
      setShowDiscardHoldDialog(true);
      return;
    }
    closeBillingWindow();
  };

  const confirmDiscardResumedHoldChanges = () => {
    setShowDiscardHoldDialog(false);
    closeBillingWindow();
  };

  const loadHistoricalInvoice = (billLike, mode = 'view') => {
    const bill = billLike?.fullBill || billLike || {};
    const restoredCart = (bill.items || []).map(toCartItem);

    setCart(restoredCart);
    setCustomerName(bill.customerName || '');
    setCustomerMobile(bill.customerMobile || '');
    setPaymentMethod(normalizePaymentMode(bill.paymentMethod || 'cash'));
    setDiscountPercent(
      bill.subtotal > 0
        ? Number(bill.discountPercent || 0)
        : 0
    );
    setDiscountAmount(Number(bill.discountAmount || 0));
    setAmountPaid(Number(bill.paidAmount || 0));
    setCashReceived(bill.cashReceived ? String(bill.cashReceived) : '');
    setSplitPayments((bill.paymentDetails?.length ? bill.paymentDetails : [
      { method: normalizePaymentMode(bill.paymentMethod || 'cash'), amount: Number(bill.paidAmount || 0), reference: '' }
    ]).map((entry) => ({
      method: normalizePaymentMode(entry.method || entry.paymentMethod),
      amount: entry.amount || '',
      reference: entry.reference || ''
    })));
    setInvoiceMode(mode === 'edit' ? 'edit' : 'view');
    setLoadedBill(bill);
    setIsEditingBill(mode === 'edit' && Boolean(bill._id));
    setEditingBillId(bill._id || null);
    setEditingInvoiceNumber(bill.invoiceNo || bill.invoiceNumber || '');
    setResumedHoldId(null);
    setResumedHoldMeta(null);
    holdBaselineRef.current = '';
    setEditingCartIndex(null);

    if (bill.invoiceAt || bill.createdAt) {
      try {
        const at = new Date(bill.invoiceAt || bill.createdAt);
        if (!isNaN(at.getTime())) {
          setInvoiceDate(at.toISOString().slice(0, 10));
          setInvoiceTime(`${padTimePart(at.getHours())}:${padTimePart(at.getMinutes())}`);
          setInvoiceTimestampEdited(true);
        }
      } catch (e) {}
    }

    setShowHoldBillsModal(false);
    setSelectedIndex(-1);
    setEditingCartIndex(null);
    entryRef.current?.focusProductId();
    toast.success(mode === 'edit' ? 'Invoice ready to edit' : 'Invoice opened read-only');
  };

  useEffect(() => {
    if (!pendingAutoPrint || !loadedBill || invoiceMode !== 'view') return;
    setPendingAutoPrint(false);
    handlePrint();
  }, [pendingAutoPrint, loadedBill, invoiceMode]);

  const loadBillForEditing = (billLike) => loadHistoricalInvoice(billLike, 'edit');

  /**
   * Resume a held bill
   */
  const handleResumeHeldBill = (heldBill) => {
    // Support multiple payload shapes: heldBill, resumeBill or direct items list
    const payload = heldBill?.heldBill || heldBill?.resumeBill || heldBill || null;
    if (!payload) return;
    const snapshot = payload.snapshot || heldBill?.snapshot || {};

    if (payload.mode === 'edit' || payload.editBillId) {
      loadBillForEditing(payload.fullBill || payload);
      return;
    }

    // Confirm replace if cart not empty
    if (cart.length > 0) {
      const confirmed = window.confirm('Replace current cart with resumed bill?');
      if (!confirmed) return;
    }

    const items = snapshot.cart?.length ? snapshot.cart : payload.cart?.length ? payload.cart : (payload.items && payload.items.length) ? payload.items : (payload.fullBill?.items || []);
    const restoredCart = (items || []).map(toHeldCartItem);
    const customer = snapshot.customer || payload.customer || {};
    const totals = snapshot.totals || payload.totals || payload;
    const payment = snapshot.payment || payload.payment || {};
    const restoredPaymentMethod = normalizePaymentMode(payment.paymentMethod || payment.method || payload.paymentMethod || 'cash');
    const paymentDetails = payment.paymentDetails?.length ? payment.paymentDetails : payload.paymentDetails?.length ? payload.paymentDetails : [
      { method: restoredPaymentMethod, amount: Number(payment.paidAmount ?? payment.amountPaid ?? payload.paidAmount ?? payload.amountPaid ?? 0), reference: '' }
    ];
    const restoredSplitPayments = (paymentDetails || []).map((entry) => ({
      method: normalizePaymentMode(entry.method || entry.paymentMethod),
      amount: entry.amount || '',
      reference: entry.reference || ''
    }));
    let restoredDate = '';
    let restoredTime = '';
    const restoredInvoiceAt = snapshot.invoice?.invoiceAt || payload.invoiceAt;
    if (restoredInvoiceAt) {
      try {
        const at = new Date(restoredInvoiceAt);
        if (!isNaN(at.getTime())) {
          restoredDate = at.toISOString().slice(0,10);
          restoredTime = `${padTimePart(at.getHours())}:${padTimePart(at.getMinutes())}`;
        }
      } catch (e) {}
    }
    if (!restoredDate || !restoredTime) {
      const current = currentInvoiceDateTime();
      restoredDate = current.date;
      restoredTime = current.time;
    }

    setCart(restoredCart);
    setCustomerName(customer.name || payload.customerName || '');
    setCustomerMobile(customer.mobile || customer.phone || payload.customerMobile || '');
    setPaymentMethod(restoredPaymentMethod);
    setAmountPaid(Number(payment.paidAmount ?? payment.amountPaid ?? payload.paidAmount ?? payload.amountPaid ?? 0));
    setCashReceived(payment.cashReceived != null ? String(payment.cashReceived) : payload.cashReceived ? String(payload.cashReceived) : '');
    setSplitPayments(restoredSplitPayments);
    setDiscountPercent(
      Number(totals.subtotal || 0) > 0
        ? Number(totals.discountPercent || 0)
        : 0
    );
    setDiscountAmount(Number(totals.discountAmount || 0));
    setResumedHoldId(payload._id || payload.id || null);
    setHeldSnapshot({ ...snapshot, customer, totals, payment });
    setResumedHoldMeta({
      holdNo: payload.invoiceNo || snapshot.invoice?.invoiceNo || payload.holdNo || payload._id || payload.id || '',
      invoiceNo: payload.invoiceNo || snapshot.invoice?.invoiceNo || '',
      createdAt: payload.createdAt || snapshot.metadata?.heldAt || payload.invoiceAt || null,
      updatedAt: payload.updatedAt || snapshot.metadata?.updatedAt || snapshot.metadata?.heldAt || payload.createdAt || null
    });
    setHoldSnapshotDirty(false);
    setInvoiceMode('hold');
    setLoadedBill(null);
    setIsEditingBill(false);
    setEditingBillId(null);
    setEditingInvoiceNumber(payload.invoiceNo || snapshot.invoice?.invoiceNo || '');
    setInvoiceDate(restoredDate);
    setInvoiceTime(restoredTime);
    setInvoiceTimestampEdited(true);
    holdBaselineRef.current = makeHoldFingerprintFromState({
      invoiceDate: restoredDate,
      invoiceTime: restoredTime,
      customerName: customer.name || payload.customerName || '',
      customerMobile: customer.mobile || customer.phone || payload.customerMobile || '',
      paymentMethod: restoredPaymentMethod,
      discountPercent: Number(totals.subtotal || 0) > 0 ? Number(totals.discountPercent || 0) : 0,
      discountAmount: Number(totals.discountAmount || 0),
      amountPaid: Number(payment.paidAmount ?? payment.amountPaid ?? payload.paidAmount ?? payload.amountPaid ?? 0),
      cashReceived: payment.cashReceived != null ? String(payment.cashReceived) : payload.cashReceived ? String(payload.cashReceived) : '',
      splitPayments: restoredSplitPayments,
      cart: restoredCart
    });

    setShowHoldBillsModal(false);
    setSelectedIndex(-1);
    setEditingCartIndex(null);

    entryRef.current?.focusProductId();
    console.log('Billing state restored from held snapshot', { items: restoredCart.length, total: totals.total ?? payload.total });
    toast.success('Held bill restored');
  };

  const handleUpdateBill = async () => {
    try {
      if (!editingBillId || cart.length === 0) {
        toast.error('Nothing to update');
        return;
      }
      const payload = makeBillPayload();
      const validationError = validateCurrentBill(payload);
      if (validationError) {
        toast.error(validationError);
        return;
      }
      await billingAPI.updateBill(editingBillId, payload);
      toast.success('Bill updated successfully');
      const { data } = await billingAPI.getBill(editingBillId);
      loadHistoricalInvoice(data.bill, 'view');
    } catch (err) {
      console.error('Update bill error:', err);
      toast.error(err.response?.data?.message || 'Failed to update bill');
    }
  };

  // Setup KeyboardManager and keep mutable refs pointing to latest handlers
  useEffect(() => {
    latestCartLenRef.current = cart.length;
    removeSelectedRef.current = removeSelectedItem;
    handleSaveRef.current = handleSave;
    handleHoldRef.current = handleHold;
    handlePrintRef.current = handlePrint;
    handleNewBillRef.current = handleNewBill;
    handleResumeRef.current = (payload) => handleResumeHeldBill(payload);

    actionsRef.current = {
      focusProduct: () => { if (!isReadOnly) entryRef.current?.focusProductId(); },
      focusCustomer: () => { if (!isReadOnly) customerNameRef.current?.focus(); },
      focusDiscount: () => { if (!isReadOnly) discountPercentRef.current?.focus(); },
      focusPayment: () => { if (!isReadOnly) paymentMethodRef.current?.focus(); },
      editSelectedItem: () => { if (!isReadOnly && selectedIndex >= 0) editCartItem(selectedIndex); },
      newBill: () => handleNewBillRef.current?.(),
      resumeHoldBill: () => { if (invoiceMode === 'new') setShowHoldBillsModal(true); },
      deleteItem: () => { if (!isReadOnly) removeSelectedRef.current?.(); },
      save: () => { if (invoiceMode === 'new' || invoiceMode === 'hold') handleSaveRef.current?.(); else if (invoiceMode === 'edit') handleUpdateBill(); },
      hold: () => { if (invoiceMode === 'new' || invoiceMode === 'hold') handleHoldRef.current?.(); },
      saveDraft: () => { if (invoiceMode === 'new' || invoiceMode === 'hold') handleHoldRef.current?.(); },
      salesReturn: () => { window.location.hash = '#/sales-returns'; },
      print: () => handlePrintRef.current?.(),
      printInvoice: () => handlePrintRef.current?.(),
      clearRow: () => invoiceMode === 'hold' ? handleCloseBill() : editingCartIndex != null ? cancelCartEdit() : entryRef.current?.focusProductId(),
      closeBill: () => handleCloseBill(),
      selectNext: () => setSelectedIndex(i => Math.min(Math.max(0, i + 1), Math.max(0, latestCartLenRef.current - 1))),
      selectPrev: () => setSelectedIndex(i => Math.max(0, i - 1))
    };

    if (!kmRef.current) {
      const km = new KeyboardManager({
        focusProduct: (...args) => actionsRef.current.focusProduct?.(...args),
        focusCustomer: (...args) => actionsRef.current.focusCustomer?.(...args),
        focusDiscount: (...args) => actionsRef.current.focusDiscount?.(...args),
        focusPayment: (...args) => actionsRef.current.focusPayment?.(...args),
        editSelectedItem: (...args) => actionsRef.current.editSelectedItem?.(...args),
        newBill: (...args) => actionsRef.current.newBill?.(...args),
        resumeHoldBill: (...args) => actionsRef.current.resumeHoldBill?.(...args),
        deleteItem: (...args) => actionsRef.current.deleteItem?.(...args),
        save: (...args) => actionsRef.current.save?.(...args),
        hold: (...args) => actionsRef.current.hold?.(...args),
        saveDraft: (...args) => actionsRef.current.saveDraft?.(...args),
        salesReturn: (...args) => actionsRef.current.salesReturn?.(...args),
        print: (...args) => actionsRef.current.print?.(...args),
        printInvoice: (...args) => actionsRef.current.printInvoice?.(...args),
        clearRow: (...args) => actionsRef.current.clearRow?.(...args),
        closeBill: (...args) => actionsRef.current.closeBill?.(...args),
        selectNext: (...args) => actionsRef.current.selectNext?.(...args),
        selectPrev: (...args) => actionsRef.current.selectPrev?.(...args)
      });
      kmRef.current = km;
      km.start();
    }

    return () => {
      kmRef.current?.stop();
      kmRef.current = null;
    };
  }, [cart, selectedIndex, editingCartIndex, customerName, customerMobile, paymentMethod, discountPercent, discountAmount, amountPaid, cashReceived, splitPayments, invoiceDate, invoiceTime, invoiceMode, resumedHoldId]);

  const computedTotals = useMemo(() => {
    const lines = cart.map(calculateCartLine);
    const subtotalValue = lines.reduce((sum, line) => sum + line.taxableAmount, 0);
    const taxTotalValue = lines.reduce((sum, line) => sum + line.gstAmount, 0);
    const itemDiscountTotal = lines.reduce((sum, line) => sum + line.discount, 0);
    const billPercentDiscount = subtotalValue * Number(discountPercent || 0) / 100;
    const billAmountDiscount = Number(discountAmount || 0);
    return {
      subtotal: subtotalValue,
      taxTotal: taxTotalValue,
      itemDiscount: itemDiscountTotal,
      billDiscount: billPercentDiscount + billAmountDiscount,
      discount: itemDiscountTotal + billPercentDiscount + billAmountDiscount,
      total: Math.max(subtotalValue + taxTotalValue - billPercentDiscount - billAmountDiscount, 0)
    };
  }, [cart, discountPercent, discountAmount]);

  const { subtotal, taxTotal, discount, total } = computedTotals;
  const heldTotals = resumedHoldId && heldSnapshot?.totals && !holdSnapshotDirty ? heldSnapshot.totals : null;
  const displayedSubtotal = heldTotals ? Number(heldTotals.subtotal || 0) : isReadOnly && loadedBill ? Number(loadedBill.subtotal || 0) : subtotal;
  const displayedTaxTotal = heldTotals ? Number(heldTotals.taxTotal ?? heldTotals.gst ?? 0) : isReadOnly && loadedBill ? Number(loadedBill.taxTotal || 0) : taxTotal;
  const displayedDiscount = heldTotals ? Number(heldTotals.discount || 0) : isReadOnly && loadedBill ? Number(loadedBill.discount || 0) : discount;
  const displayedTotal = heldTotals ? Number(heldTotals.total ?? heldTotals.billTotal ?? 0) : isReadOnly && loadedBill ? Number(loadedBill.total || 0) : total;
  const normalizedPaymentMethod = normalizePaymentMode(paymentMethod);
  const isCashPayment = normalizedPaymentMethod === 'cash';
  const isSplitPayment = normalizedPaymentMethod === 'split';
  const heldPayment = resumedHoldId && heldSnapshot?.payment && !holdSnapshotDirty ? heldSnapshot.payment : null;
  const effectivePaidAmount = heldPayment ? Number(heldPayment.paidAmount ?? heldPayment.amountPaid ?? 0) : isSplitPayment ? splitPaidAmount : paymentAmount(amountPaid, total, paymentMethod);
  const balanceDue = Math.max(0, displayedTotal - effectivePaidAmount);
  const displayedBalanceDue = heldPayment ? Number(heldPayment.balanceAmount ?? heldPayment.balanceDue ?? heldPayment.outstanding ?? balanceDue) : isReadOnly && loadedBill ? Number(loadedBill.dueAmount || 0) : balanceDue;
  const cashReceivedAmount = Number(cashReceived || 0);
  const cashDifference = cashReceived === '' ? 0 : cashReceivedAmount - displayedTotal;
  const cashDifferenceLabel = cashDifference < 0 ? 'Remaining Amount' : cashDifference > 0 ? 'Change to Return' : 'Change';
  const cashDifferenceTone = cashDifference < 0
    ? 'border-red-200 bg-red-50 text-red-700'
    : cashDifference > 0
      ? 'border-green-200 bg-green-50 text-green-700'
      : 'border-slate-200 bg-slate-50 text-slate-700';
  const itemCount = cart.length;
  const quantity = cart.reduce((sum, it) => sum + parseFloat(it.qty || 0), 0);
  const holdBannerText = resumedHoldMeta
    ? (
      <span className="flex flex-col leading-tight">
        <span>RESUMED HOLD BILL</span>
        <span>Hold No : {resumedHoldMeta.holdNo || resumedHoldId}</span>
        <span>Created : {dateTime(resumedHoldMeta.createdAt)}</span>
        <span>Last Updated : {dateTime(resumedHoldMeta.updatedAt)}</span>
      </span>
    )
    : 'Resumed Hold Bill';
  const liveInvoiceSale = {
    invoiceNumber: 'AUTO',
    invoiceAt: `${invoiceDate}T${invoiceTime}`,
    customerName: customerName || 'Walk-in Customer',
    customerMobile,
    paymentMethod,
    items: cart,
    subtotal: displayedSubtotal,
    taxTotal: displayedTaxTotal,
    discount: displayedDiscount,
    total: displayedTotal,
    paidAmount: isSplitPayment ? splitPaidAmount : paymentAmount(amountPaid, displayedTotal, paymentMethod),
    balanceAmount: Math.max(0, displayedTotal - (isSplitPayment ? splitPaidAmount : paymentAmount(amountPaid, displayedTotal, paymentMethod))),
    paymentDetails: isSplitPayment ? normalizedSplitPayments : []
  };

  return (
    <div className="h-screen overflow-hidden bg-gray-50 flex flex-col text-[length:var(--app-font-size)]">
      {/* Header */}
      <div className="shrink-0 bg-gradient-to-r from-blue-600 to-blue-700 px-3 py-2 text-white shadow-lg sm:px-4 sm:py-3">
        <div className="flex flex-wrap items-center justify-between gap-3 lg:flex-nowrap">
          <div className="min-w-[240px]">
            <h1 className="text-lg font-bold leading-tight sm:text-xl">POS Billing System</h1>
            <p className="text-xs leading-tight text-blue-100 sm:text-sm">Keyboard-First Modern Interface</p>
            <div className={`mt-1 inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${invoiceMode === 'view' ? 'bg-cyan-500' : invoiceMode === 'edit' || invoiceMode === 'hold' ? 'bg-amber-500' : 'bg-emerald-500'}`}>
              {invoiceMode === 'view' ? `Viewing Invoice ${editingInvoiceNumber}` : invoiceMode === 'edit' ? `Editing Invoice ${editingInvoiceNumber}` : invoiceMode === 'hold' ? holdBannerText : 'New Invoice'}
            </div>
          </div>
          <div className="flex flex-1 flex-wrap items-center justify-end gap-x-4 gap-y-2 text-sm">
            <div className="flex shrink-0 items-center gap-2">
              <label className="text-xs font-medium text-blue-100">Date:</label>
              <input disabled={isReadOnly} type="date" value={invoiceDate} onChange={(e) => { setInvoiceDate(e.target.value); setInvoiceTimestampEdited(true); markHoldWorkingCopyChanged(); }} className="rounded px-2 py-1 text-sm text-black disabled:opacity-70" />
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <label className="text-xs font-medium text-blue-100">Time:</label>
              <input disabled={isReadOnly} type="time" value={invoiceTime} onChange={(e) => { setInvoiceTime(e.target.value); setInvoiceTimestampEdited(true); markHoldWorkingCopyChanged(); }} className="rounded px-2 py-1 text-sm text-black disabled:opacity-70" />
            </div>
            <div className="min-w-[150px] shrink-0 text-right">
              <div className="text-2xl font-bold leading-none sm:text-3xl">{currency(displayedTotal)}</div>
              <div className="mt-1 text-xs leading-tight text-blue-100 sm:text-sm">{itemCount} Items &bull; {quantity} Qty</div>
              </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex min-h-0 flex-1 gap-[var(--pos-gap)] overflow-hidden p-[var(--pos-gap)]">
        {/* Left side - Entry and Cart */}
        <div className="flex min-w-0 flex-1 flex-col gap-[var(--pos-gap)]">
          {/* Entry row */}
          <div className="shrink-0 bg-white shadow-md rounded-lg p-3">
            {isReadOnly ? <div className="rounded-lg bg-cyan-50 p-3 text-sm font-semibold text-cyan-800">Read-only invoice — click Edit to change items</div> : <BillingEntryRow ref={entryRef} onAddItem={handleAddItem} canEditPrice={canEditPrice} editingIndex={editingCartIndex} onCancelEdit={cancelCartEdit} />}
          </div>
          
          {/* Cart items table */}
          <div className="flex-1 bg-white shadow-md rounded-lg p-3 min-h-0 overflow-hidden flex flex-col">
            <h2 className="text-lg font-bold mb-2">Cart Items</h2>
            <div className="flex-1 overflow-auto">
              <BillingTable
                cart={cart}
                invoiceLanguage={settings?.invoiceLanguage}
                onSelectIndex={setSelectedIndex}
                selectedIndex={selectedIndex}
                onEditItem={editCartItem}
                onClearCart={clearCart}
                readOnly={isReadOnly}
                onRemove={(i) => {
                  if (isReadOnly) return;
                  setHoldSnapshotDirty(true);
                  setCart((p) => p.filter((_, idx) => idx !== i));
                  setSelectedIndex(-1);
                  setEditingCartIndex(null);
                  setTimeout(() => entryRef.current?.focusProductId(), 50);
                }}
              />
            </div>
          </div>
          <div className="shrink-0 flex gap-[var(--pos-gap)]">
        <button
          ref={saveBillButtonRef}
          onClick={isEditingBill ? handleUpdateBill : handleSave}
          className={`${invoiceMode === 'view' ? 'hidden' : ''} flex-1 bg-green-600 text-white py-2.5 rounded-lg font-semibold`}
        >
        {isEditingBill ? '📝Update Bill' : '💾Save Bill'}
        </button>

        <button
          onClick={handleHold}
          className={`${invoiceMode !== 'new' && invoiceMode !== 'hold' ? 'hidden' : ''} flex-1 bg-yellow-500 text-white py-2.5 rounded-lg font-semibold`}
        >
        {invoiceMode === 'hold' ? 'Update Existing Hold Bill' : 'Create New Hold Bill'}
        </button>

        {invoiceMode === 'view' && <button onClick={() => { setInvoiceMode('edit'); setIsEditingBill(true); }} className="flex-1 bg-amber-500 text-white py-2.5 rounded-lg font-semibold">Edit</button>}

        <button
          onClick={() => handlePrint()}
          className="flex-1 bg-slate-700 text-white py-2.5 rounded-lg font-semibold"
        >
          🖨Print
        </button>
        
        {invoiceMode !== 'new' && <button onClick={handleCloseBill} className="flex-1 bg-red-600 text-white py-2.5 rounded-lg font-semibold">Close</button>}
      </div>
          
        </div>

        {/* Right side - Summary and Preview */}
        <div className="flex w-[clamp(20rem,30vw,24rem)] min-w-0 flex-col gap-[var(--pos-gap)]">
          {/* Summary panel */}
          <div className="bg-white shadow-md rounded-lg p-3">
            <BillingSummaryPanel
              cart={cart}
              subtotal={displayedSubtotal}
              taxTotal={displayedTaxTotal}
              discount={displayedDiscount}
              total={displayedTotal}
              invoiceAt={`${invoiceDate}T${invoiceTime}`}
              onSave={handleSave}
              onHold={handleHold}
              onPrint={handlePrint}
            />
          </div>

          {/* Customer info panel */}
          <div className="min-h-0 flex-1 overflow-y-auto bg-white shadow-md rounded-lg p-3">
                <h2 className="text-lg font-bold mb-2">
                  Customer Details
                </h2>
              <div className="space-y-2">
                <div className="relative">
                  <label className="text-sm font-semibold">Name</label>

                  <input
                      ref={customerNameRef}
                      disabled={isReadOnly}
                      list="customer-list"
                      value={customerName}
                      onFocus={() => setShowCustomerDropdown(true)}
                      onChange={(e) => {
                          const value = e.target.value;

                          markHoldWorkingCopyChanged();
                          setCustomerName(value);
                          setShowCustomerDropdown(true);

                          if (!value.trim()) {
                              setFilteredCustomers(allCustomers);
                              setCustomerSuggestions([]);
                              return;
                          }

                          const filtered = allCustomers.filter(customer =>
                              customer.name?.toLowerCase().includes(value.toLowerCase()) ||
                              customer.mobile?.includes(value)
                          );

                          setFilteredCustomers(filtered);
                          searchCustomers(value);
                      }}
                      placeholder="Customer Name"
                      className="w-full p-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                  />

                  <datalist id="customer-list">
                      {filteredCustomers.map(customer => (
                          <option
                              key={customer._id}
                              value={customer.name}
                          />
                      ))}
                  </datalist>

                  {showCustomerDropdown && (customerSearchLoading || customerSuggestions.length > 0 || filteredCustomers.length > 0) && (
                    <div ref={customerDropdownRef} className="absolute left-0 right-0 z-20 mt-1 max-h-60 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                      {customerSearchLoading ? (
                        <div className="p-2 text-sm text-slate-500">
                          Searching customers...
                        </div>
                      ) : customerSuggestions.length > 0 ? (
                        customerSuggestions.map((customer, idx) => (
                          <button
                            key={customer._id || idx}
                            type="button"
                            onClick={() => selectCustomerSuggestion(customer)}
                            className={`w-full px-3 py-2 text-left text-sm ${
                              idx === customerSuggestionIndex
                                ? 'bg-blue-100'
                                : 'hover:bg-slate-50'
                            }`}
                          >
                            <div className="font-medium">
                              {customer.name}
                            </div>

                            <div className="text-xs text-slate-500">
                              {customer.mobile || 'No mobile'}
                            </div>
                          </button>
                        ))
                      ) : filteredCustomers.length > 0 ? (
                        filteredCustomers.slice(0, 10).map((customer, idx) => (
                          <button
                            key={customer._id || idx}
                            type="button"
                            onClick={() => selectCustomerSuggestion(customer)}
                            className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                          >
                            <div className="font-medium">
                              {customer.name}
                            </div>
                            <div className="text-xs text-slate-500">
                              {customer.mobile || 'No mobile'}
                            </div>
                          </button>
                        ))
                      ) : (
                        <div className="p-2 text-sm text-slate-500">No matching customers</div>
                      )}
                    </div>
                  )}
                </div>
                <div className="relative">
                  <label className="text-sm font-semibold">Mobile</label>
                  <input
                    ref={customerMobileRef}
                    disabled={isReadOnly}
                    type="tel"
                    placeholder="Customer mobile (optional)"
                    value={customerMobile}
                    onChange={(e) => { markHoldWorkingCopyChanged(); setCustomerMobile(e.target.value); }}
                    className="w-full p-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                  />
                  </div>
                <div>
                  <label className="text-sm font-semibold">Payment Method</label>
                  <select
                    ref={paymentMethodRef}
                    disabled={isReadOnly}
                    value={paymentMethod}
                    onChange={(e) => {
                      const nextMethod = e.target.value;
                      markHoldWorkingCopyChanged();
                      setPaymentMethod(nextMethod);
                      if (normalizePaymentMode(nextMethod) !== 'cash') setCashReceived('');
                    }}
                    className="w-full p-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="cash">Cash</option>
                    <option value="upi">UPI</option>
                    <option value="card">Card</option>
                    <option value="credit">Credit</option>
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="cheque">Cheque</option>
                    <option value="wallet">Wallet</option>
                    <option value="split">Split Payment</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-sm font-semibold">Discount %</label>
                  <input
                    ref={discountPercentRef}
                    type="number"
                    disabled={isReadOnly}
                    min="0"
                    max="100"
                    step="0.5"
                    value={discountPercent}
                    onChange={(e) => { markHoldWorkingCopyChanged(); setDiscountPercent(Number(e.target.value)); }}
                    className="w-full p-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold">Discount Amt</label>
                  <input
                    type="number"
                    disabled={isReadOnly}
                    min="0"
                    step="0.01"
                    value={discountAmount}
                    onChange={(e) => { markHoldWorkingCopyChanged(); setDiscountAmount(Math.max(0, Number(e.target.value))); }}
                    className="w-full p-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                </div>
              </div>
            
            {isSplitPayment && (
              <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <div className="text-sm font-semibold">Split Payment</div>
                  <button type="button" disabled={isReadOnly} onClick={addSplitPaymentRow} className="rounded bg-blue-600 px-2 py-1 text-xs font-semibold text-white disabled:opacity-40">Add</button>
                </div>
                <div className="space-y-2">
                  {splitPayments.map((entry, index) => (
                    <div key={index} className="grid grid-cols-12 gap-1">
                      <select disabled={isReadOnly} value={entry.method} onChange={(e) => updateSplitPayment(index, { method: e.target.value })} className="col-span-4 rounded border p-2 text-xs">
                        <option value="cash">Cash</option>
                        <option value="upi">UPI</option>
                        <option value="card">Card</option>
                        <option value="bank_transfer">Bank</option>
                        <option value="cheque">Cheque</option>
                        <option value="wallet">Wallet</option>
                      </select>
                      <input disabled={isReadOnly} type="number" min="0" step="0.01" value={entry.amount} onChange={(e) => updateSplitPayment(index, { amount: e.target.value })} className="col-span-3 rounded border p-2 text-right text-xs" />
                      <input disabled={isReadOnly} value={entry.reference} onChange={(e) => updateSplitPayment(index, { reference: e.target.value })} placeholder="Ref" className="col-span-4 rounded border p-2 text-xs" />
                      <button type="button" disabled={isReadOnly || splitPayments.length <= 1} onClick={() => removeSplitPaymentRow(index)} className="col-span-1 rounded border text-xs text-red-600 disabled:opacity-40">X</button>
                    </div>
                  ))}
                </div>
                <div className={`mt-2 rounded border p-2 text-sm font-semibold ${Math.abs(splitPaidAmount - displayedTotal) <= 0.01 ? 'border-green-200 bg-green-50 text-green-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
                  Paid {currency(splitPaidAmount)} / Balance {currency(Math.max(displayedTotal - splitPaidAmount, 0))}
                </div>
              </div>
            )}

            {(isCashPayment || paymentMethod === 'credit') && (
              <div>
                <label className="text-sm font-semibold">
                  Amount Paid
                </label>

                <input
                  ref={amountPaidRef}
                  type="number"
                  disabled={isReadOnly}
                  readOnly={isCashPayment}
                  min="0"
                  step="0.01"
                  value={isCashPayment ? displayedTotal.toFixed(2) : amountPaid}
                  onChange={(e) => { markHoldWorkingCopyChanged(); setAmountPaid(Math.max(0, Number(e.target.value))); }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && isCashPayment) {
                      e.preventDefault();
                      cashReceivedRef.current?.focus();
                    }
                  }}
                  className="w-full p-2 border rounded-lg text-sm"
                />
              </div>
              )}
              {isCashPayment && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <label className="text-sm font-semibold">
                    Cash Received
                  </label>
                  <input
                    ref={cashReceivedRef}
                    type="number"
                    disabled={isReadOnly}
                    min="0"
                    step="0.01"
                    value={cashReceived}
                    onChange={(e) => {
                      const value = e.target.value;
                      markHoldWorkingCopyChanged();
                      setCashReceived(value === '' ? '' : String(Math.max(0, Number(value))));
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        saveBillButtonRef.current?.focus();
                      }
                    }}
                    placeholder="0.00"
                    className="mt-1 w-full rounded-lg border p-2 text-sm focus:ring-2 focus:ring-blue-500"
                  />
                  <div className={`mt-2 rounded-lg border p-3 ${cashDifferenceTone}`}>
                    <div className="text-sm font-semibold">
                      {cashDifferenceLabel}
                    </div>
                    <div className="text-2xl font-bold">
                      {currency(Math.abs(cashDifference))}
                    </div>
                  </div>
                </div>
              )}
              {paymentMethod === 'credit' && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 mt-2">
                  <div className="text-sm font-semibold text-red-700">
                    Outstanding Amount
                  </div>

                  <div className="text-2xl font-bold text-red-600">
                    ₹{displayedBalanceDue.toFixed(2)}
                  </div>
                </div>
              )}
          </div>

          {/* Invoice preview */}
          <div className="shrink-0">
            <button
              onClick={() => setShowInvoicePreview(true)}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 rounded-lg font-semibold"
            >
              📄 View Invoice Preview
            </button>
          </div>
        </div>
      </div>

      {/* Invoice Preview Modal */}
      {showInvoicePreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3">
          <div className="bg-white rounded-xl shadow-xl w-[900px] max-w-[95vw] max-h-[92vh] h-[min(85vh,760px)] flex flex-col">

            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-xl font-bold">
                Invoice Preview
              </h2>

              <button
                onClick={() => setShowInvoicePreview(false)}
                className="px-4 py-2 bg-red-500 text-white rounded-lg"
              >
                X
              </button>
            </div>

            <div className="invoice-preview-scale flex-1 overflow-auto p-4">
              <InvoicePreview
                sale={liveInvoiceSale}
                settings={settings || {}}
              />
            </div>

          </div>
        </div>
      )}

      {showDiscardHoldDialog && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl">
            <h2 className="text-lg font-bold text-slate-900">Discard Changes?</h2>
            <p className="mt-2 text-sm text-slate-600">You have unsaved changes to this held bill.</p>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button type="button" onClick={confirmDiscardResumedHoldChanges} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white">Yes - Close Without Saving</button>
              <button type="button" onClick={() => setShowDiscardHoldDialog(false)} className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-semibold text-white">No - Continue Editing</button>
              <button type="button" onClick={() => setShowDiscardHoldDialog(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Hold Bills modal */}
      <HoldBillsModal
        isOpen={showHoldBillsModal}
        onClose={() => setShowHoldBillsModal(false)}
        onResumeHeldBill={handleResumeHeldBill}
      />

      {/* Keyboard shortcuts help */}
      <div className="shrink-0 bg-gray-100 border-t px-4 py-1.5 text-xs text-gray-600">
        <div className="flex flex-wrap gap-4">
          <span>F1: New | F3: Customer | F4: Hold | F8: Print</span>
          <span>Ctrl+S: Save | Ctrl+H: Hold | Ctrl+P: Print | Ctrl+F: Search</span>
          <span>F2: Edit Row | ESC: Clear/Cancel Edit | Del: Remove | Tab: Next Field</span>
        </div>
      </div>
    </div>
  );
}

