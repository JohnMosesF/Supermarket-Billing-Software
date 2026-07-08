import React, { useState, useRef, useEffect } from 'react';
import BillingEntryRow from './BillingEntryRow.jsx';
import BillingTable from './BillingTable.jsx';
import BillingSummaryPanel from './BillingSummaryPanel.jsx';
import InvoicePreview from './InvoicePreview.jsx';
import HoldBillsModal from './HoldBillsModal.jsx';
import KeyboardManager from './KeyboardManager.js';
import { billingAPI, holdBillAPI, customerAPI } from './billingService.js';
import { api } from '../api/http.js';
import { currency, dateTime } from '../utils/format.js';
import toast from 'react-hot-toast';
import { printInvoice, makeInvoiceHtmlFromSale } from '../utils/print';
import { normalizeBillItem } from '../utils/normalizeBillItem.js';

const toCartItem = (item) => {
  const normalized = normalizeBillItem(item);
  return {
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

  const params = getQueryParams();
  const windowId = params.get('windowId');
  // Cart state
  const [cart, setCart] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);

  useEffect(() => {
    console.log("Selected Index:", selectedIndex);
  }, [selectedIndex]);
  
  // Customer and payment info
  const [customerName, setCustomerName] = useState('');
  const [customerMobile, setCustomerMobile] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [discountPercent, setDiscountPercent] = useState(0);
  const [customerSuggestions, setCustomerSuggestions] = useState([]);
  const [allCustomers, setAllCustomers] = useState([]);
  const [filteredCustomers, setFilteredCustomers] = useState([]);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [customerSuggestionIndex, setCustomerSuggestionIndex] = useState(-1);
  const [customerSearchLoading, setCustomerSearchLoading] = useState(false);
  const [amountPaid, setAmountPaid] = useState(0);
  
  // UI state
  const [showHoldBillsModal, setShowHoldBillsModal] = useState(false);
  const [showInvoicePreview, setShowInvoicePreview] = useState(false);
  
  // Invoice date/time (editable)
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const defaultDate = now.toISOString().slice(0, 10);
  const defaultTime = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const [invoiceDate, setInvoiceDate] = useState(defaultDate);
  const [invoiceTime, setInvoiceTime] = useState(defaultTime);
  const [resumedHoldId, setResumedHoldId] = useState(null);
  const [lastManualEdit, setLastManualEdit] = useState(0);
  const [settings, setSettings] = useState(null);
  const [isEditingBill, setIsEditingBill] = useState(false);
  const [editingBillId, setEditingBillId] = useState(null);
  const [editingInvoiceNumber, setEditingInvoiceNumber] = useState('');
  const [invoiceMode, setInvoiceMode] = useState('new');
  const [loadedBill, setLoadedBill] = useState(null);
  const [pendingAutoPrint, setPendingAutoPrint] = useState(false);
  const isReadOnly = invoiceMode === 'view';

  // Live date/time update: tick every second unless user edited recently
  useEffect(() => {
    api.get('/settings', { silent: true }).then((res) => setSettings(res.data.settings)).catch(() => {});
    const id = setInterval(() => {
      if (invoiceMode !== 'new') return;
      const now = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const sysDate = now.toISOString().slice(0, 10);
      const sysTime = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
      // if user edited within last 5 seconds, avoid overwriting immediate manual edits
      if (Date.now() - lastManualEdit < 5000) return;
      setInvoiceDate((d) => (d === sysDate ? d : sysDate));
      setInvoiceTime((t) => (t === sysTime ? t : sysTime));
    }, 1000);
    return () => clearInterval(id);
  }, [lastManualEdit, invoiceMode]);
  

  // Refs
  const entryRef = useRef(null);
  const customerNameRef = useRef(null);
  const customerMobileRef = useRef(null);
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

  /**
   * Initialize keyboard shortcuts
   */
  // KeyboardManager setup moved below after handler definitions to avoid TDZ

  // Listen for resume payload sent from main window (electron)
  const hasCartItems = cart.some(
    item => Number(item.qty || item.quantity || 0) > 0
  );
  const hasUnsavedChanges = hasCartItems && invoiceMode !== 'view';

  function getQueryParams() {
      const hash = window.location.hash;

      if (hash.includes("?")) {
          return new URLSearchParams(hash.substring(hash.indexOf("?")));
      }

      return new URLSearchParams(window.location.search);
  }

  useEffect(() => {
    const params = getQueryParams();
    const windowId = params.get('windowId');

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

  const normalizePaymentMode = (value) => {
    const normalized = String(value || 'cash').trim().toLowerCase();
    if (normalized === 'upi') return 'upi';
    if (normalized === 'card') return 'card';
    if (normalized === 'credit') return 'credit';
    if (normalized === 'cheque') return 'cheque';
    if (normalized === 'wallet') return 'wallet';
    if (normalized === 'online') return 'online';
    return 'cash';
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
    setCart((prev) => {
      const productId = item.productId || item._id || item.name;
      // Merge only if same product AND same selling price
      const existing = prev.findIndex((r) => (r.productId || r._id || r.name) === productId && Number(r.rate || r.price || r.sellingPrice || 0) === Number(item.rate || item.price || item.sellingPrice || 0));

      if (existing >= 0) {
        // Item exists with same price, update quantity
        const copy = [...prev];
        copy[existing] = {
          ...copy[existing],
          qty: parseFloat(copy[existing].qty || 0) + parseFloat(item.qty || 0)
        };
        return copy;
      }

      // New item (different product or different price)
      return [...prev, item];
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
    toast.success('Item removed');
    // return focus to product entry and ensure totals refresh
    setTimeout(() => entryRef.current?.focusProductId(), 50);
  };

  /**
   * Update item in cart
   */
  const updateItem = (index, patch) => {
    setCart((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], ...patch };
      return copy;
    });
  };

  /**
   * Create bill payload
   */
  const makeBillPayload = () => {
    if (cart.length === 0) {
      throw new Error('Cart is empty');
    }

    const subtotal = cart.reduce((sum, item) => {
      const gross = Number(item.rate || 0) * parseFloat(item.qty || 0);
      const gstRate = Number(item.gst || 0);

      return sum + (
        gstRate > 0
          ? gross / (1 + gstRate / 100)
          : gross
      );
    }, 0);

    const taxTotal = cart.reduce((sum, item) => {
      const gross = Number(item.rate || 0) * parseFloat(item.qty || 0);
      const gstRate = Number(item.gst || 0);

      if (gstRate <= 0) return sum;

      const taxable = gross / (1 + gstRate / 100);

      return sum + (gross - taxable);
    }, 0);

    const discount = (subtotal * Number(discountPercent || 0)) / 100;

    const total = subtotal + taxTotal - discount;

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
        total: normalized.netAmount
      };
    });

    const paidAmount = paymentAmount(amountPaid, total, paymentMethod);
    const balanceAmount = Math.max(0, total - paidAmount);

    const payload = {
      items,
      subtotal,
      taxTotal,
      discount,
      total,

      paymentMethod: paymentMethod || 'Cash',
      invoiceNo: editingInvoiceNumber || undefined,
      invoiceNumber: editingInvoiceNumber || undefined,

      customerName: customerName || 'Walk-in Customer',
      customerMobile: customerMobile || null,

      amountPaid: paidAmount,
      paidAmount,

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
        } catch (e) {
          console.error('Failed to delete held bill after save', e);
        }
      }
      if(clearAfterSave) {
        setCart([]);
        setCustomerName('');
        setCustomerMobile('');
        setDiscountPercent(0);
        setPaymentMethod('cash');
        setSelectedIndex(-1);
        setIsEditingBill(false);
        setEditingBillId(null);
        setEditingInvoiceNumber('');
        setAmountPaid(0);
        entryRef.current?.focusProductId();
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

      const payload = makeBillPayload();
      console.log('Holding bill payload', payload);
      
      await holdBillAPI.holdBill(payload);
      
      toast.success('Bill held successfully');
      
      // Reset after successful hold
      setCart([]);
      setCustomerName('');
      setCustomerMobile('');
      setDiscountPercent(0);
      setPaymentMethod('cash');
      setSelectedIndex(-1);
      
      entryRef.current?.focusProductId();
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
      if (invoiceMode === 'new') {
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
          return;
      }

      if (invoiceMode === 'new') handleNewBill();

      toast.success('Invoice sent to printer');
    } catch (err) {
      console.error('Print bill error:', err);
      toast.error(err.response?.data?.message || err.message || 'Failed to print invoice');
    }
  };

  /**
   * Start new bill
   */
  const handleNewBill = () => {
    if (cart.length > 0) {
      const confirmed = window.confirm('Clear current bill and start new?');
      if (!confirmed) return;
    }
    
    setCart([]);
    setCustomerName('');
    setCustomerMobile('');
    setDiscountPercent(0);
    setPaymentMethod('cash');
    setSelectedIndex(-1);
    setIsEditingBill(false);
    setEditingBillId(null);
    setEditingInvoiceNumber('');
    setInvoiceMode('new');
    setLoadedBill(null);
    setAmountPaid(0);
    entryRef.current?.focusProductId();
    toast.info('New bill started');
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
        ? (Number(bill.discount || 0) / Number(bill.subtotal || 1)) * 100
        : 0
    );
    setAmountPaid(Number(bill.paidAmount || 0));
    setInvoiceMode(mode === 'edit' ? 'edit' : 'view');
    setLoadedBill(bill);
    setIsEditingBill(mode === 'edit' && Boolean(bill._id));
    setEditingBillId(bill._id || null);
    setEditingInvoiceNumber(bill.invoiceNo || bill.invoiceNumber || '');
    setResumedHoldId(null);

    if (bill.invoiceAt || bill.createdAt) {
      try {
        const at = new Date(bill.invoiceAt || bill.createdAt);
        if (!isNaN(at.getTime())) {
          setInvoiceDate(at.toISOString().slice(0, 10));
          setInvoiceTime(`${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`);
        }
      } catch (e) {}
    }

    setShowHoldBillsModal(false);
    setSelectedIndex(-1);
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

    if (payload.mode === 'edit' || payload.editBillId) {
      loadBillForEditing(payload.fullBill || payload);
      return;
    }

    // Confirm replace if cart not empty
    if (cart.length > 0) {
      const confirmed = window.confirm('Replace current cart with resumed bill?');
      if (!confirmed) return;
    }

    const items = (payload.items && payload.items.length) ? payload.items : (payload.fullBill?.items || []);
    const restoredCart = (items || []).map(toCartItem);

    setCart(restoredCart);
    setCustomerName(payload.customerName || payload.customer || '');
    setCustomerMobile(payload.customerMobile || payload.customerMobile || payload.customer?.mobile || '');
    setPaymentMethod(payload.paymentMethod || 'cash');
    setDiscountPercent(
      payload.subtotal > 0
        ? (payload.discount / payload.subtotal) * 100
        : 0
    );
    setResumedHoldId(payload._id || payload.id || null);

    // restore invoice date/time if present
    if (payload.invoiceAt) {
      try {
        const at = new Date(payload.invoiceAt);
        if (!isNaN(at.getTime())) {
          setInvoiceDate(at.toISOString().slice(0,10));
          setInvoiceTime(`${String(at.getHours()).padStart(2,'0')}:${String(at.getMinutes()).padStart(2,'0')}`);
        }
      } catch (e) {}
    }

    setShowHoldBillsModal(false);
    setSelectedIndex(-1);

    entryRef.current?.focusProductId();
    console.log('Billing state restored from held bill', { items: restoredCart.length, total: payload.total });
    toast.success('Held bill restored');
  };

  const handleUpdateBill = async () => {
    try {
      if (!editingBillId || cart.length === 0) {
        toast.error('Nothing to update');
        return;
      }
      const payload = makeBillPayload();
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
      newBill: () => handleNewBillRef.current?.(),
      resumeHoldBill: () => { if (invoiceMode === 'new') setShowHoldBillsModal(true); },
      deleteItem: () => { if (!isReadOnly) removeSelectedRef.current?.(); },
      save: () => { if (invoiceMode === 'new') handleSaveRef.current?.(); else if (invoiceMode === 'edit') handleUpdateBill(); },
      hold: () => { if (invoiceMode === 'new') handleHoldRef.current?.(); },
      print: () => handlePrintRef.current?.(),
      printInvoice: () => handlePrintRef.current?.(),
      clearRow: () => entryRef.current?.focusProductId(),
      selectNext: () => setSelectedIndex(i => Math.min(Math.max(0, i + 1), Math.max(0, latestCartLenRef.current - 1))),
      selectPrev: () => setSelectedIndex(i => Math.max(0, i - 1))
    };

    if (!kmRef.current) {
      const km = new KeyboardManager({
        focusProduct: (...args) => actionsRef.current.focusProduct?.(...args),
        focusCustomer: (...args) => actionsRef.current.focusCustomer?.(...args),
        newBill: (...args) => actionsRef.current.newBill?.(...args),
        resumeHoldBill: (...args) => actionsRef.current.resumeHoldBill?.(...args),
        deleteItem: (...args) => actionsRef.current.deleteItem?.(...args),
        save: (...args) => actionsRef.current.save?.(...args),
        hold: (...args) => actionsRef.current.hold?.(...args),
        print: (...args) => actionsRef.current.print?.(...args),
        printInvoice: (...args) => actionsRef.current.printInvoice?.(...args),
        clearRow: (...args) => actionsRef.current.clearRow?.(...args),
        selectNext: (...args) => actionsRef.current.selectNext?.(...args),
        selectPrev: (...args) => actionsRef.current.selectPrev?.(...args)
      });
      kmRef.current = km;
      km.start();
    }

    return () => {
      kmRef.current?.stop();
    };
  }, [cart.length, customerName, customerMobile, paymentMethod, discountPercent, invoiceMode]);

  /**
   * Calculate totals
   */
  const subtotal = cart.reduce((sum, item) => {
    const gross = Number(item.rate || 0) * parseFloat(item.qty || 0);
    const gstRate = Number(item.gst || 0);

    return sum + (
      gstRate > 0
        ? gross / (1 + gstRate / 100)
        : gross
    );
  }, 0);

  const taxTotal = cart.reduce((sum, item) => {
    const gross = Number(item.rate || 0) * parseFloat(item.qty || 0);
    const gstRate = Number(item.gst || 0);

    if (gstRate <= 0) return sum;

    const taxable = gross / (1 + gstRate / 100);

    return sum + (gross - taxable);
  }, 0);

  const discount = (subtotal * Number(discountPercent || 0)) / 100;

  const total = subtotal + taxTotal - discount;
  const displayedSubtotal = isReadOnly && loadedBill ? Number(loadedBill.subtotal || 0) : subtotal;
  const displayedTaxTotal = isReadOnly && loadedBill ? Number(loadedBill.taxTotal || 0) : taxTotal;
  const displayedDiscount = isReadOnly && loadedBill ? Number(loadedBill.discount || 0) : discount;
  const displayedTotal = isReadOnly && loadedBill ? Number(loadedBill.total || 0) : total;
  const balanceDue =
    Math.max(0, total - paymentAmount(amountPaid, total, paymentMethod));
  const displayedBalanceDue = isReadOnly && loadedBill ? Number(loadedBill.dueAmount || 0) : balanceDue;
  const itemCount = cart.length;
  const quantity = cart.reduce((sum, it) => sum + parseFloat(it.qty || 0), 0);
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
    paidAmount: paymentAmount(amountPaid, displayedTotal, paymentMethod),
    balanceAmount: Math.max(0, displayedTotal - paymentAmount(amountPaid, displayedTotal, paymentMethod))
  };

  return (
    <div className="h-screen overflow-y-auto bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-4 shadow-lg">
        <div className="flex justify-between items-center">
          <div>
            <div>
              <h1 className="text-2xl font-bold">POS Billing System</h1>
              <p className="text-blue-100 text-sm">Keyboard-First Modern Interface</p>
              <div className={`mt-1 inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${invoiceMode === 'view' ? 'bg-cyan-500' : invoiceMode === 'edit' ? 'bg-amber-500' : 'bg-emerald-500'}`}>
                {invoiceMode === 'view' ? `Viewing Invoice ${editingInvoiceNumber}` : invoiceMode === 'edit' ? `Editing Invoice ${editingInvoiceNumber}` : 'New Invoice'}
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold">{currency(displayedTotal)}</div>
              <div className="text-blue-100 text-sm">{itemCount} items • {quantity} qty</div>
            <div className="mt-2 flex items-center gap-2 text-sm">
              <div className="flex items-center gap-2">
                <label className="text-xs text-blue-100">Date</label>
                <input disabled={invoiceMode !== 'new'} type="date" value={invoiceDate} onChange={(e) => { setInvoiceDate(e.target.value); setLastManualEdit(Date.now()); }} className="p-1 rounded text-sm text-black disabled:opacity-70" />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-blue-100">Time</label>
                <input disabled={invoiceMode !== 'new'} type="time" value={invoiceTime} onChange={(e) => { setInvoiceTime(e.target.value); setLastManualEdit(Date.now()); }} className="p-1 rounded text-sm text-black disabled:opacity-70" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex gap-3 p-3 overflow-hidden">
        {/* Left side - Entry and Cart */}
        <div className="flex-1 flex flex-col gap-3 min-w-0">
          {/* Entry row */}
          <div className="bg-white shadow-md rounded-lg p-3">
            {isReadOnly ? <div className="rounded-lg bg-cyan-50 p-3 text-sm font-semibold text-cyan-800">Read-only invoice — click Edit to change items</div> : <BillingEntryRow ref={entryRef} onAddItem={handleAddItem} />}
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
                onUpdateItem={updateItem}
                onRemove={(i) => {
                  if (isReadOnly) return;
                  setCart((p) => p.filter((_, idx) => idx !== i));
                  setSelectedIndex(-1);
                  setTimeout(() => entryRef.current?.focusProductId(), 50);
                }}
              />
            </div>
          </div>
          <div className="mt-4 flex gap-3">
        <button
          onClick={isEditingBill ? handleUpdateBill : handleSave}
          className={`${invoiceMode === 'view' ? 'hidden' : ''} flex-1 bg-green-600 text-white py-3 rounded-lg font-semibold`}
        >
        {isEditingBill ? '📝Update Bill' : '💾Save Bill'}
        </button>

        <button
          onClick={handleHold}
          className={`${invoiceMode !== 'new' ? 'hidden' : ''} flex-1 bg-yellow-500 text-white py-3 rounded-lg font-semibold`}
        >
        ⏸Hold
        </button>

        {invoiceMode === 'view' && <button onClick={() => { setInvoiceMode('edit'); setIsEditingBill(true); }} className="flex-1 bg-amber-500 text-white py-3 rounded-lg font-semibold">Edit</button>}

        <button
          onClick={() => handlePrint()}
          className="flex-1 bg-slate-700 text-white py-3 rounded-lg font-semibold"
        >
          🖨Print
        </button>
        {invoiceMode !== 'new' && <button onClick={() => handlePrint('72mm')} className="flex-1 bg-indigo-600 text-white py-3 rounded-lg font-semibold">72mm Print</button>}
        {invoiceMode !== 'new' && <button onClick={() => handlePrint('80mm')} className="flex-1 bg-indigo-700 text-white py-3 rounded-lg font-semibold">80mm</button>}
        {invoiceMode !== 'new' && <button onClick={() => handlePrint('A4')} className="flex-1 bg-purple-700 text-white py-3 rounded-lg font-semibold">A4</button>}
        {invoiceMode !== 'new' && <button onClick={() => window.close()} className="flex-1 bg-red-600 text-white py-3 rounded-lg font-semibold">Close</button>}
      </div>
          
        </div>

        {/* Right side - Summary and Preview */}
        <div className="w-96 flex flex-col gap-3 min-w-0">
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
          <div className="flex flex-col gap-4 overflow-y-auto bg-white shadow-md rounded-lg p-3">
                <h2 className="text-lg font-bold mb-3">
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
                    onChange={(e) => setCustomerMobile(e.target.value)}
                    className="w-full p-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                  />
                  </div>
                <div>
                  <label className="text-sm font-semibold">Payment Method</label>
                  <select
                    disabled={isReadOnly}
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="w-full p-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="cash">Cash</option>
                    <option value="credit">Credit</option>
                    <option value="upi">UPI</option>
                    <option value="card">Card</option>
                    <option value="cheque">Cheque</option>
                    <option value="wallet">Wallet</option>
                    <option value="online">Online</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm font-semibold">Discount %</label>
                  <input
                    type="number"
                    disabled={isReadOnly}
                    min="0"
                    max="100"
                    step="0.5"
                    value={discountPercent}
                    onChange={(e) => setDiscountPercent(Number(e.target.value))}
                    className="w-full p-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            
            {paymentMethod === 'credit' && (
              <div>
                <label className="text-sm font-semibold">
                  Amount Paid
                </label>

                <input
                  type="number"
                  disabled={isReadOnly}
                  min="0"
                  step="0.01"
                  value={amountPaid}
                  onChange={(e) => setAmountPaid(Number(e.target.value))}
                  className="w-full p-2 border rounded-lg text-sm"
                />
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
          <div className="mt-3">
            <button
              onClick={() => setShowInvoicePreview(true)}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-lg font-semibold"
            >
              📄 View Invoice Preview
            </button>
          </div>
        </div>
      </div>

      {/* Invoice Preview Modal */}
      {showInvoicePreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-xl w-[900px] max-w-[95vw] h-[85vh] flex flex-col">

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

            <div className="flex-1 overflow-auto p-4">
              <InvoicePreview
                sale={liveInvoiceSale}
                settings={settings || {}}
              />
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
      <div className="bg-gray-100 border-t px-4 py-2 text-xs text-gray-600">
        <div className="flex flex-wrap gap-4">
          <span>F1: New | F3: Customer | F4: Hold | F8: Print</span>
          <span>Ctrl+S: Save | Ctrl+H: Hold | Ctrl+P: Print | Ctrl+F: Search</span>
          <span>ESC: Clear | Del: Remove | Tab: Next Field</span>
        </div>
      </div>
    </div>
  );
}

