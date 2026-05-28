import { create } from 'zustand';
import { useEffect, useMemo, useState, useCallback } from 'react';
import { Plus, Minus, Printer, Trash2, Save, Clock, LogOut } from 'lucide-react';
import toast from 'react-hot-toast';
import { currency } from '../utils/format.js';
import ProductSearch from './ProductSearch.jsx';
import { billingAPI } from './billingService.js';

// Per-window Zustand store
export function createBillingStore(windowId) {
  return create((set, get) => ({
    windowId,
    invoiceNo: null,
    cart: [],
    discount: 0,
    customerMobile: '',
    paymentMethod: 'cash',
    customerName: '',
    
    setInvoiceNo: (n) => set({ invoiceNo: n }),
    addProductToCart: (product) => set((s) => {
      if (product.stock <= 0) {
        toast.error(`${product.name} is out of stock`);
        return s;
      }
      const existing = s.cart.find((it) => it._id === product._id);
      if (existing) {
        return {
          cart: s.cart.map((it) =>
            it._id === product._id ? { ...it, quantity: Math.min(it.quantity + 1, product.stock) } : it
          ),
        };
      }
      return { cart: [...s.cart, { ...product, quantity: 1 }] };
    }),
    
    changeQty: (productId, delta) =>
      set((s) => ({
        cart: s.cart.map((it) =>
          it._id === productId
            ? { ...it, quantity: Math.max(1, Math.min(it.stock, it.quantity + delta)) }
            : it
        ),
      })),
    
    removeItem: (productId) =>
      set((s) => ({
        cart: s.cart.filter((it) => it._id !== productId),
      })),
    
    clearCart: () => set({ cart: [], discount: 0, customerMobile: '', customerName: '' }),
    
    setCustomerMobile: (m) => set({ customerMobile: m }),
    setCustomerName: (n) => set({ customerName: n }),
    setDiscount: (d) => set({ discount: d }),
    setPaymentMethod: (p) => set({ paymentMethod: p }),
  }));
}

function useQuery() {
  const hash = window.location.hash || '';
  if (hash.includes('?')) return new URLSearchParams(hash.split('?')[1]);
  return new URLSearchParams(window.location.search);
}

export default function CreateBillWindow() {
  const query = useQuery();
  const invoiceNo = query.get('invoiceNo') || `INV${Date.now()}`;
  const windowId = query.get('windowId') || `win-${Date.now()}`;
  
  const [useStore] = useState(() => createBillingStore(windowId));
  const state = useStore();
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    useStore.getState().setInvoiceNo(invoiceNo);
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const totals = useMemo(() => {
    const subtotal = state.cart.reduce((s, it) => s + it.sellingPrice * it.quantity, 0);
    const taxTotal = state.cart.reduce((s, it) => s + ((it.sellingPrice * it.quantity) * (it.taxRate || 0)) / 100, 0);
    return {
      subtotal,
      taxTotal,
      discount: Number(state.discount || 0),
      total: Math.max(subtotal + taxTotal - Number(state.discount || 0), 0),
    };
  }, [state.cart, state.discount]);

  const handleAddProduct = useCallback((product) => {
    useStore.getState().addProductToCart(product);
    toast.success(`${product.name} added to cart`);
  }, []);

  const handlePrint = async () => {
    if (state.cart.length === 0) {
      toast.error('Cart is empty');
      return;
    }
    // Use standard browser/Electron print with preview (not silent)
    window.print();
  };

  const handleSaveBill = async () => {
    if (state.cart.length === 0) {
      toast.error('Add items before saving');
      return;
    }

    try {
      const billData = {
        invoiceNo: state.invoiceNo,
        items: state.cart.map((it) => ({
          product: it._id,
          quantity: it.quantity,
          sellingPrice: it.sellingPrice,
          taxRate: it.taxRate,
        })),
        subtotal: totals.subtotal,
        taxTotal: totals.taxTotal,
        discount: totals.discount,
        total: totals.total,
        paymentMethod: state.paymentMethod,
        customerMobile: state.customerMobile || undefined,
        customerName: state.customerName || undefined,
      };

      await billingAPI.createBill(billData);
      toast.success('Bill saved successfully!');
      useStore.getState().clearCart();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save bill');
    }
  };

  const handleHoldBill = async () => {
    if (state.cart.length === 0) {
      toast.error('Add items before holding');
      return;
    }

    try {
      await billingAPI.holdBill({
        items: state.cart,
        subtotal: totals.subtotal,
        discount: totals.discount,
        total: totals.total,
        customerMobile: state.customerMobile,
      });
      toast.success('Bill held successfully!');
      useStore.getState().clearCart();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to hold bill');
    }
  };

  return (
    <div className="h-screen bg-white dark:bg-slate-950 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 px-6 py-3">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-lg font-bold">Invoice #{state.invoiceNo}</h1>
            <p className="text-xs text-slate-500">{currentTime.toLocaleString()}</p>
          </div>
          <button className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-300" onClick={() => window.close()}>
            ✕
          </button>
        </div>

        {/* Product Search */}
        <ProductSearch onAddProduct={handleAddProduct} />

        {/* Customer Info */}
        <div className="mt-3 grid grid-cols-2 gap-3">
          <input
            type="text"
            placeholder="Customer name (optional)"
            className="input text-sm"
            value={state.customerName}
            onChange={(e) => useStore.getState().setCustomerName(e.target.value)}
          />
          <input
            type="text"
            placeholder="Mobile number (optional)"
            className="input text-sm"
            value={state.customerMobile}
            onChange={(e) => useStore.getState().setCustomerMobile(e.target.value)}
          />
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden flex gap-6 p-6">
        {/* Cart Table */}
        <div className="flex-1 flex flex-col">
          <h2 className="font-semibold mb-3 text-sm text-slate-600 dark:text-slate-300">Cart Items</h2>
          <div className="flex-1 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-slate-100 dark:bg-slate-800 sticky top-0">
                <tr>
                  <th className="text-left px-4 py-2">Product</th>
                  <th className="text-right px-4 py-2 w-16">Qty</th>
                  <th className="text-right px-4 py-2 w-20">Price</th>
                  <th className="text-right px-4 py-2 w-16">Tax</th>
                  <th className="text-right px-4 py-2 w-24">Total</th>
                  <th className="text-center px-4 py-2 w-12">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {state.cart.length > 0 ? (
                  state.cart.map((item) => {
                    const itemTotal = item.sellingPrice * item.quantity;
                    const itemTax = (itemTotal * (item.taxRate || 0)) / 100;
                    return (
                      <tr key={item._id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <td className="px-4 py-2">
                          <div className="font-semibold">{item.name}</div>
                          <div className="text-xs text-slate-500">{item.sku}</div>
                        </td>
                        <td className="text-right px-4 py-2">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded"
                              onClick={() => useStore.getState().changeQty(item._id, -1)}
                            >
                              <Minus size={14} />
                            </button>
                            <span className="w-6 text-center font-bold">{item.quantity}</span>
                            <button
                              className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded"
                              onClick={() => useStore.getState().changeQty(item._id, 1)}
                            >
                              <Plus size={14} />
                            </button>
                          </div>
                        </td>
                        <td className="text-right px-4 py-2">{currency(item.sellingPrice)}</td>
                        <td className="text-right px-4 py-2 text-xs text-slate-500">{item.taxRate || 0}%</td>
                        <td className="text-right px-4 py-2 font-bold">{currency(itemTotal + itemTax)}</td>
                        <td className="text-center px-4 py-2">
                          <button
                            className="text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 p-1 rounded"
                            onClick={() => {
                              useStore.getState().removeItem(item._id);
                              toast.success('Item removed');
                            }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan="6" className="px-4 py-8 text-center text-slate-500">
                      Cart is empty. Search and add products above.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Sidebar: Summary & Payment */}
        <div className="w-80 flex flex-col gap-4">
          {/* Summary */}
          <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-4 bg-slate-50 dark:bg-slate-900/50">
            <h3 className="font-semibold mb-3 text-sm">Bill Summary</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-600 dark:text-slate-400">Subtotal</span>
                <span className="font-semibold">{currency(totals.subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600 dark:text-slate-400">GST/Tax</span>
                <span className="font-semibold">{currency(totals.taxTotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600 dark:text-slate-400">Discount</span>
                <span className="font-semibold text-orange-600">{currency(totals.discount)}</span>
              </div>
              <div className="border-t border-slate-300 dark:border-slate-700 pt-2 mt-2 flex justify-between text-lg font-bold">
                <span>Total</span>
                <span className="text-green-600 dark:text-green-400">{currency(totals.total)}</span>
              </div>
            </div>

            {/* Discount Input */}
            <div className="mt-4">
              <label className="text-xs text-slate-600 dark:text-slate-400 block mb-1">Discount Amount</label>
              <input
                type="number"
                className="input w-full text-sm"
                value={state.discount}
                onChange={(e) => useStore.getState().setDiscount(Number(e.target.value))}
              />
            </div>
          </div>

          {/* Payment Methods */}
          <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-4">
            <h3 className="font-semibold mb-3 text-sm">Payment Method</h3>
            <div className="grid grid-cols-3 gap-2">
              {['cash', 'upi', 'card'].map((method) => (
                <button
                  key={method}
                  onClick={() => useStore.getState().setPaymentMethod(method)}
                  className={`py-2 px-3 rounded font-semibold text-sm transition capitalize ${
                    state.paymentMethod === method
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  {method}
                </button>
              ))}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="space-y-2">
            <button
              onClick={handleSaveBill}
              disabled={state.cart.length === 0}
              className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Save size={18} /> Save Bill
            </button>
            <button
              onClick={handleHoldBill}
              disabled={state.cart.length === 0}
              className="btn-muted w-full flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Clock size={18} /> Hold Bill
            </button>
            <button
              onClick={handlePrint}
              disabled={state.cart.length === 0}
              className="btn-muted w-full flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Printer size={18} /> Print
            </button>
            <button
              onClick={() => useStore.getState().clearCart()}
              className="btn-muted w-full flex items-center justify-center gap-2"
            >
              <LogOut size={18} /> Clear Cart
            </button>
          </div>
        </div>
      </div>

      {/* Print Styles */}
      <style media="print">{`
        @page { margin: 0; size: 80mm auto; }
        body { margin: 0; padding: 6px; font-family: monospace; font-size: 12px; }
        .no-print { display: none !important; }
      `}</style>
    </div>
  );
}
