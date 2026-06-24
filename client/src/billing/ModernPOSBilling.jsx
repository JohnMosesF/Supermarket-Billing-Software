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

  const params = new URLSearchParams(window.location.search);
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

  // Live date/time update: tick every second unless user edited recently
  useEffect(() => {
    api.get('/settings', { silent: true }).then((res) => setSettings(res.data.settings)).catch(() => {});
    const id = setInterval(() => {
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
  }, [lastManualEdit]);
  

  // Refs
  const entryRef = useRef(null);
  const customerNameRef = useRef(null);
  const customerMobileRef = useRef(null);
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

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const windowId = params.get('windowId');

    if (window.electronAPI?.sendBillingEvent && windowId) {
      window.electronAPI.sendBillingEvent(
        `billing-cart-state-${windowId}`,
        cart.length > 0
      );
    }
  }, [cart, windowId]);

  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (!hasCartItems) return;

      e.preventDefault();
      e.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [hasCartItems]);

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

  const fetchCustomerSuggestions = async (query) => {
    if (!query || String(query).trim().length < 2) {
      setCustomerSuggestions([]);
      return;
    }

    try {
      setCustomerSearchLoading(true);
      const res = await customerAPI.searchCustomers(query.trim());
      setCustomerSuggestions(res.data?.customers || []);
      setCustomerSuggestionIndex(-1);
    } catch (err) {
      console.error('Customer search failed', err);
      setCustomerSuggestions([]);
    } finally {
      setCustomerSearchLoading(false);
    }
  };

  useEffect(() => {
    const query = customerMobile?.trim() || customerName?.trim();
    if (!query || query.length < 2) {
      setCustomerSuggestions([]);
      return;
    }

    const timer = window.setTimeout(() => fetchCustomerSuggestions(query), 250);
    return () => clearTimeout(timer);
  }, [customerMobile, customerName]);

  const selectCustomerSuggestion = (customer) => {
    setCustomerName(customer.name || '');
    setCustomerMobile(customer.mobile || '');
    setCustomerSuggestions([]);
    setCustomerSuggestionIndex(-1);
    customerMobileRef.current?.focus();
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

    const subtotal = cart.reduce((s, it) => s + Number(it.rate || 0) * parseFloat(it.qty || 0), 0);
    const taxTotal = cart.reduce((s, it) => {
      const itemTotal = Number(it.rate || 0) * parseFloat(it.qty || 0);
      return s + (itemTotal * Number(it.gst || 0)) / 100;
    }, 0);
    
    const discount = (subtotal * Number(discountPercent || 0)) / 100;
    const total = subtotal + taxTotal - discount;

    /**
     * CRITICAL: Map cart items to server-expected format
     * Server expects: { _id (or productId), productName, quantity, price, gst, total }
     * where _id or productId is MongoDB ObjectId
     */
    const items = cart.map((it) => {
      const pid = it._id || it.productId;
      if (!pid) {
        throw new Error(`Cart item missing MongoDB ObjectId: ${JSON.stringify(it)}`);
      }
      return {
        _id: pid,
        productId: pid,
        productName: it.productName || it.name || '',
        quantity: parseFloat(it.qty ?? it.quantity ?? 1),
        unit: it.unit || 'pcs',
        price: parseFloat(it.rate ?? it.sellingPrice ?? it.price ?? 0),
        gst: parseFloat(it.gst ?? it.taxRate ?? it.tax ?? 0),
        total: Number(
          it.amount != null
            ? it.amount
            : (parseFloat(it.rate ?? it.sellingPrice ?? it.price ?? 0) *
              parseFloat(it.qty ?? it.quantity ?? 1))
        )
      };
    });

    const payload = {
      items,
      subtotal,
      taxTotal,
      discount,
      total,

      paymentMethod: paymentMethod || 'Cash',

      customerName: customerName || 'Walk-in Customer',
      customerMobile: customerMobile || null,

      // CREDIT SUPPORT
      amountPaid:
        paymentMethod === 'credit'
          ? Number(amountPaid || 0)
          : total,

      balanceDue:
        paymentMethod === 'credit'
          ? Math.max(0, total - Number(amountPaid || 0))
          : 0,

      paymentStatus:
        paymentMethod === 'credit' &&
        Math.max(0, total - Number(amountPaid || 0)) > 0
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
  const handleSave = async () => {
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
      
      await billingAPI.createBill(payload);
      await ensureCustomerProfile();
      toast.success('Bill saved successfully');
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
      
      // Reset after successful save
      setCart([]);
      setCustomerName('');
      setCustomerMobile('');
      setDiscountPercent(0);
      setPaymentMethod('cash');
      setSelectedIndex(-1);
      
      // Focus product ID for next entry
      entryRef.current?.focusProductId();
    } catch (err) {
      console.error('Save bill error:', err);
      toast.error(err.response?.data?.message || 'Failed to save bill');
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
  const handlePrint = async () => {
    if (cart.length === 0) {
      toast.error('Cart is empty');
      return;
    }

    try {
      const payload = makeBillPayload();
      if (!payload.items?.length || Number(payload.total || 0) <= 0) {
        toast.error('Invoice has no printable items or total is invalid');
        return;
      }

      const saleToPrint = {
        ...payload,
        invoiceNumber: payload.invoiceNo || payload.invoiceNumber || 'AUTO',
        invoiceAt: payload.invoiceAt || `${invoiceDate}T${invoiceTime}`,
        paymentMethod,
        items: payload.items
      };
      const html = makeInvoiceHtmlFromSale(saleToPrint, settings || {});

      if (!html || html.trim().length < 50) {
        toast.error('Invoice preview is empty. Nothing was printed.');
        return;
      }

      const result = await printInvoice(html, {
        silent: true,
        printBackground: true,
        deviceName: settings?.printerName || undefined,
        meta: {
          storeName: settings?.storeName,
          gst: settings?.gstNumber,
          invoiceNo: saleToPrint.invoiceNumber,
          date: saleToPrint.invoiceAt
        }
      });

      if (!result?.ok) {
        toast.error(`Printing failed: ${result?.error || 'Unknown printer error'}`);
        return;
      }

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
    
    entryRef.current?.focusProductId();
    toast.info('New bill started');
  };

  /**
   * Resume a held bill
   */
  const handleResumeHeldBill = (heldBill) => {
    // Support multiple payload shapes: heldBill, resumeBill or direct items list
    const payload = heldBill.heldBill || heldBill.resumeBill || heldBill || null;
    if (!payload) return;

    // Confirm replace if cart not empty
    if (cart.length > 0) {
      const confirmed = window.confirm('Replace current cart with resumed bill?');
      if (!confirmed) return;
    }

    const items = (payload.items && payload.items.length) ? payload.items : (payload.fullBill?.items || []);
    const restoredCart = (items || []).map((item) => ({
      _id: item.productId,
      productId: item.productId,
      name: item.productName || item.name || item.productName || item.name || '',
      rate: item.price || item.sellingPrice || item.rate || 0,
      qty: item.quantity || item.qty || 0,
      gst: item.gst || item.tax || item.taxRate || 0,
      unit: item.unit || 'pcs',
      allowDecimalQty: item.allowDecimalQty || false,
      amount: item.total != null ? item.total : (Number(item.price || item.sellingPrice || item.rate || 0) * parseFloat(item.quantity || item.qty || 0)),
      gstAmount: ((Number(item.price || item.sellingPrice || item.rate || 0) * parseFloat(item.quantity || item.qty || 0)) * (Number(item.gst || item.tax || item.taxRate || 0))) / 100
    }));

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
      focusProduct: () => entryRef.current?.focusProductId(),
      newBill: () => handleNewBillRef.current?.(),
      resumeHoldBill: () => setShowHoldBillsModal(true),
      deleteItem: () => removeSelectedRef.current?.(),
      save: () => handleSaveRef.current?.(),
      hold: () => handleHoldRef.current?.(),
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
  }, [cart.length, customerName, customerMobile, paymentMethod, discountPercent]);

  /**
   * Calculate totals
   */
  const subtotal = cart.reduce((s, it) => s + Number(it.rate || 0) * parseFloat(it.qty || 0), 0);
  const taxTotal = cart.reduce((s, it) => {
    const itemTotal = Number(it.rate || 0) * parseFloat(it.qty || 0);
    return s + (itemTotal * Number(it.gst || 0)) / 100;
  }, 0);
  const discount = (subtotal * Number(discountPercent || 0)) / 100;
  const total = subtotal + taxTotal - discount;
  const balanceDue =
    paymentMethod === 'credit'
      ? Math.max(0, total - Number(amountPaid || 0))
      : 0;
  const itemCount = cart.length;
  const quantity = cart.reduce((sum, it) => sum + parseFloat(it.qty || 0), 0);
  const liveInvoiceSale = {
    invoiceNumber: 'AUTO',
    invoiceAt: `${invoiceDate}T${invoiceTime}`,
    customerName: customerName || 'Walk-in Customer',
    customerMobile,
    paymentMethod,
    items: cart,
    subtotal,
    taxTotal,
    discount,
    total
  };

  return (
    <div className="h-screen overflow-y-auto bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-4 shadow-lg">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">POS Billing System</h1>
            <p className="text-blue-100 text-sm">Keyboard-First Modern Interface</p>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold">{currency(total)}</div>
              <div className="text-blue-100 text-sm">{itemCount} items • {quantity} qty</div>
            <div className="mt-2 flex items-center gap-2 text-sm">
              <div className="flex items-center gap-2">
                <label className="text-xs text-blue-100">Date</label>
                <input type="date" value={invoiceDate} onChange={(e) => { setInvoiceDate(e.target.value); setLastManualEdit(Date.now()); }} className="p-1 rounded text-sm text-black" />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-blue-100">Time</label>
                <input type="time" value={invoiceTime} onChange={(e) => { setInvoiceTime(e.target.value); setLastManualEdit(Date.now()); }} className="p-1 rounded text-sm text-black" />
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
            <BillingEntryRow ref={entryRef} onAddItem={handleAddItem} />
          </div>
          
          {/* Cart items table */}
          <div className="flex-1 bg-white shadow-md rounded-lg p-3 min-h-0 overflow-hidden flex flex-col">
            <h2 className="text-lg font-bold mb-2">Cart Items</h2>
            <div className="flex-1 overflow-auto">
              <BillingTable
                cart={cart}
                onSelectIndex={setSelectedIndex}
                selectedIndex={selectedIndex}
                onUpdateItem={updateItem}
                onRemove={(i) => {
                  setCart((p) => p.filter((_, idx) => idx !== i));
                  setSelectedIndex(-1);
                  setTimeout(() => entryRef.current?.focusProductId(), 50);
                }}
              />
            </div>
          </div>
          <div className="mt-4 flex gap-3">
        <button
          onClick={handleSave}
          className="flex-1 bg-green-600 text-white py-3 rounded-lg font-semibold"
        >
        💾Save Bill
        </button>

        <button
          onClick={handleHold}
          className="flex-1 bg-yellow-500 text-white py-3 rounded-lg font-semibold"
        >
        ⏸Hold
        </button>

        <button
          onClick={handlePrint}
          className="flex-1 bg-slate-700 text-white py-3 rounded-lg font-semibold"
        >
          🖨Print
        </button>
      </div>
          
        </div>

        {/* Right side - Summary and Preview */}
        <div className="w-96 flex flex-col gap-3 min-w-0">
          {/* Summary panel */}
          <div className="bg-white shadow-md rounded-lg p-3">
            <BillingSummaryPanel
              cart={cart}
              subtotal={subtotal}
              taxTotal={taxTotal}
              discount={discount}
              total={total}
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
                <div>
                  <label className="text-sm font-semibold">Name</label>
                  <input
                    ref={customerNameRef}
                    type="text"
                    placeholder="Customer name (optional)"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="w-full p-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="relative">
                  <label className="text-sm font-semibold">Mobile</label>
                  <input
                    ref={customerMobileRef}
                    type="tel"
                    placeholder="Customer mobile (optional)"
                    value={customerMobile}
                    onChange={(e) => setCustomerMobile(e.target.value)}
                    className="w-full p-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                  />
                  {(customerSuggestions.length > 0 || customerSearchLoading) && (
                    <div className="absolute left-0 right-0 z-20 mt-1 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
                      {customerSearchLoading ? (
                        <div className="p-2 text-sm text-slate-500">Searching customers...</div>
                      ) : (
                        customerSuggestions.map((customer, idx) => (
                          <button
                            key={customer._id || `${customer.mobile}-${idx}`}
                            type="button"
                            onClick={() => selectCustomerSuggestion(customer)}
                            className={`w-full px-3 py-2 text-left text-sm ${idx === customerSuggestionIndex ? 'bg-slate-100' : 'hover:bg-slate-50'}`}
                          >
                            <div className="font-medium">{customer.name || customer.mobile}</div>
                            <div className="text-xs text-slate-500">{customer.mobile}</div>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
                <div>
                  <label className="text-sm font-semibold">Payment Method</label>
                  <select
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
                    ₹{balanceDue.toFixed(2)}
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

