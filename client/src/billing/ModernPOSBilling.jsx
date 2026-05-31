import React, { useState, useRef, useEffect } from 'react';
import BillingEntryRow from './BillingEntryRow.jsx';
import BillingTable from './BillingTable.jsx';
import BillingSummaryPanel from './BillingSummaryPanel.jsx';
import InvoicePreview from './InvoicePreview.jsx';
import HoldBillsModal from './HoldBillsModal.jsx';
import KeyboardManager from './KeyboardManager.js';
import { billingAPI, holdBillAPI } from './billingService.js';
import toast from 'react-hot-toast';

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
  // Cart state
  const [cart, setCart] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  
  // Customer and payment info
  const [customerName, setCustomerName] = useState('');
  const [customerMobile, setCustomerMobile] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [discountPercent, setDiscountPercent] = useState(0);
  
  // UI state
  const [showCustomerPanel, setShowCustomerPanel] = useState(false);
  const [showHoldBillsModal, setShowHoldBillsModal] = useState(false);
  
  // Refs
  const entryRef = useRef(null);
  const customerNameRef = useRef(null);
  const customerMobileRef = useRef(null);

  /**
   * Initialize keyboard shortcuts
   */
  useEffect(() => {
    const km = new KeyboardManager({
      focusProduct: () => {
        entryRef.current?.focusProductId();
      },
      focusCustomer: () => {
        customerNameRef.current?.focus();
        setShowCustomerPanel(true);
      },
      newBill: () => {
        handleNewBill();
      },
      resumeHoldBill: () => {
        setShowHoldBillsModal(true);
      },
      deleteItem: () => {
        removeSelectedItem();
      },
      save: () => {
        handleSave();
      },
      hold: () => {
        handleHold();
      },
      print: () => {
        handlePrint();
      },
      printInvoice: () => {
        handlePrint();
      },
      clearRow: () => {
        entryRef.current?.focusProductId();
      },
    });
    km.start();
    return () => km.stop();
  }, [cart, customerName, customerMobile, paymentMethod, discountPercent]);

  /**
   * Add item to cart or update quantity if already exists
   */
  const handleAddItem = (item) => {
    setCart((prev) => {
      const productId = item.productId || item.name;
      const existing = prev.findIndex((r) => r.productId === productId);
      
      if (existing >= 0) {
        // Item exists, update quantity
        const copy = [...prev];
        copy[existing] = {
          ...copy[existing],
          qty: Number(copy[existing].qty) + Number(item.qty)
        };
        return copy;
      }
      
      // New item
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

    const subtotal = cart.reduce((s, it) => s + Number(it.rate || 0) * Number(it.qty || 0), 0);
    const taxTotal = cart.reduce((s, it) => {
      const itemTotal = Number(it.rate || 0) * Number(it.qty || 0);
      return s + (itemTotal * Number(it.gst || 0)) / 100;
    }, 0);
    
    const discount = (subtotal * Number(discountPercent || 0)) / 100;
    const total = subtotal + taxTotal - discount;

    const items = cart.map((it) => ({
      productId: it.productId,
      name: it.name,
      quantity: Number(it.qty || 1),
      sellingPrice: Number(it.rate || 0),
      taxRate: Number(it.gst || 0)
    }));

    return {
      items,
      subtotal,
      taxTotal,
      discount,
      total,
      paymentMethod: paymentMethod || 'cash',
      customerName: customerName || 'Walk-in Customer',
      customerMobile: customerMobile || null
    };
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
      
      await billingAPI.createBill(payload);
      
      toast.success('Bill saved successfully');
      
      // Reset after successful save
      setCart([]);
      setCustomerName('');
      setCustomerMobile('');
      setDiscountPercent(0);
      setPaymentMethod('cash');
      setShowCustomerPanel(false);
      setSelectedIndex(-1);
      
      // Focus product ID for next entry
      entryRef.current?.focusProductId();
    } catch (err) {
      console.error(err);
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
      
      await holdBillAPI.holdBill(payload);
      
      toast.success('Bill held successfully');
      
      // Reset after successful hold
      setCart([]);
      setCustomerName('');
      setCustomerMobile('');
      setDiscountPercent(0);
      setPaymentMethod('cash');
      setShowCustomerPanel(false);
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
  const handlePrint = () => {
    if (cart.length === 0) {
      toast.error('Cart is empty');
      return;
    }
    
    window.print();
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
    setShowCustomerPanel(false);
    setSelectedIndex(-1);
    
    entryRef.current?.focusProductId();
    toast.info('New bill started');
  };

  /**
   * Resume a held bill
   */
  const handleResumeHeldBill = (heldBill) => {
    // Check if current cart has items
    if (cart.length > 0) {
      const confirmed = window.confirm('Replace current cart with held bill?');
      if (!confirmed) return;
    }

    // Restore cart from held bill
    const restoredCart = heldBill.items.map((item) => ({
      productId: item.productId,
      name: item.name,
      rate: item.sellingPrice,
      qty: item.quantity,
      gst: item.taxRate,
      amount: item.sellingPrice * item.quantity,
      gstAmount: (item.sellingPrice * item.quantity * item.taxRate) / 100
    }));

    setCart(restoredCart);
    setCustomerName(heldBill.customerName || '');
    setCustomerMobile(heldBill.customerMobile || '');
    setPaymentMethod(heldBill.paymentMethod || 'cash');
    setDiscountPercent(
      heldBill.subtotal > 0
        ? (heldBill.discount / heldBill.subtotal) * 100
        : 0
    );
    setShowHoldBillsModal(false);
    setSelectedIndex(-1);

    entryRef.current?.focusProductId();
    toast.success('Held bill restored');
  };

  /**
   * Calculate totals
   */
  const subtotal = cart.reduce((s, it) => s + Number(it.rate || 0) * Number(it.qty || 0), 0);
  const taxTotal = cart.reduce((s, it) => {
    const itemTotal = Number(it.rate || 0) * Number(it.qty || 0);
    return s + (itemTotal * Number(it.gst || 0)) / 100;
  }, 0);
  const discount = (subtotal * Number(discountPercent || 0)) / 100;
  const total = subtotal + taxTotal - discount;
  const itemCount = cart.length;
  const quantity = cart.reduce((sum, it) => sum + Number(it.qty || 0), 0);

  return (
    <div className="h-full bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-4 shadow-lg">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">POS Billing System</h1>
            <p className="text-blue-100 text-sm">Keyboard-First Modern Interface</p>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold">${total.toFixed(2)}</div>
            <div className="text-blue-100 text-sm">{itemCount} items • {quantity} qty</div>
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
                }}
              />
            </div>
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
              onSave={handleSave}
              onHold={handleHold}
              onPrint={handlePrint}
            />
          </div>

          {/* Customer info panel */}
          <div className="bg-white shadow-md rounded-lg p-3">
            <button
              onClick={() => setShowCustomerPanel(!showCustomerPanel)}
              className="w-full p-2 bg-blue-500 text-white rounded-lg font-semibold hover:bg-blue-600"
            >
              {showCustomerPanel ? '▼' : '▶'} Customer Details
            </button>
            
            {showCustomerPanel && (
              <div className="mt-3 space-y-2">
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
                <div>
                  <label className="text-sm font-semibold">Mobile</label>
                  <input
                    ref={customerMobileRef}
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
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="w-full p-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="cash">Cash</option>
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
            )}
          </div>

          {/* Invoice preview */}
          <div className="flex-1 bg-white shadow-md rounded-lg p-3 min-h-0 overflow-hidden flex flex-col">
            <h2 className="text-lg font-bold mb-2">Invoice Preview</h2>
            <div className="flex-1 overflow-auto">
              <InvoicePreview
                cart={cart}
                subtotal={subtotal}
                taxTotal={taxTotal}
                discount={discount}
                total={total}
                customerName={customerName}
                customerMobile={customerMobile}
              />
            </div>
          </div>
        </div>
      </div>

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

