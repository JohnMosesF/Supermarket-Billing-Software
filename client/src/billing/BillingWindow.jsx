import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Minus, Trash2, Printer, Save, FolderPlus, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { currency } from '../utils/format.js';
import ProductSearch from './ProductSearch.jsx';
import { InvoicePreview } from '../components/InvoicePreview.jsx';
import { billingAPI, holdBillAPI } from './billingService.js';
import { createBillingStore } from './billingStore.js';

function useQuery() {
  const hash = window.location.hash || '';
  const querySource = hash.includes('?') ? hash.substring(hash.indexOf('?')) : window.location.search;
  return new URLSearchParams(querySource);
}

export default function BillingWindow() {
  const query = useQuery();
  const invoiceNo = query.get('invoiceNo') || `INV${Date.now()}`;
  const windowId = query.get('windowId') || `bill-${Date.now()}`;

  const [useStore] = useState(() => createBillingStore(windowId));
  const invoice = useStore((state) => state.invoiceNo);
  const cart = useStore((state) => state.cart);
  const discount = useStore((state) => state.discount);
  const customerName = useStore((state) => state.customerName);
  const customerMobile = useStore((state) => state.customerMobile);
  const paymentMethod = useStore((state) => state.paymentMethod);

  const [currentTime, setCurrentTime] = useState(new Date());

  const normalizePaymentMethod = (method) => {
    const value = String(method || '').trim().toLowerCase();
    if (value === 'upi') return 'UPI';
    if (value === 'cash') return 'Cash';
    if (value === 'card') return 'Card';
    return method;
  };

  useEffect(() => {
    useStore.getState().setInvoiceNo(invoiceNo);
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, [invoiceNo, useStore]);

  const totals = useMemo(() => {
    const subtotal = cart.reduce((sum, item) => sum + item.sellingPrice * item.quantity, 0);
    const taxTotal = cart.reduce(
      (sum, item) => sum + ((item.sellingPrice * item.quantity) * (item.taxRate || 0)) / 100,
      0
    );
    const discountValue = Number(discount || 0);
    const total = Math.max(subtotal + taxTotal - discountValue, 0);

    return {
      subtotal,
      taxTotal,
      discount: discountValue,
      total,
    };
  }, [cart, discount]);

  const handleAddProduct = useCallback((product) => {
    useStore.getState().addProductToCart(product);
    toast.success(`${product.name} added to cart`);
  }, [useStore]);

  const handleSaveBill = async () => {
    if (cart.length === 0) {
      toast.error('Add at least one item to save the bill');
      return;
    }

    try {
      const billData = {
        invoiceNo: invoice,
        items: cart.map((item) => {
          const lineTotal = item.sellingPrice * item.quantity;
          const taxAmount = (lineTotal * (item.taxRate || 0)) / 100;
          return {
            productId: item._id,
            productName: item.name || item.productName,
            quantity: item.quantity,
            price: item.sellingPrice,
            tax: item.taxRate || 0,
            total: Number((lineTotal + taxAmount).toFixed(2)),
          };
        }),
        subtotal: totals.subtotal,
        taxTotal: totals.taxTotal,
        discount: totals.discount,
        total: totals.total,
        paymentMethod: normalizePaymentMethod(paymentMethod),
        customerName: customerName || undefined,
        customerMobile: customerMobile || undefined,
      };

      await billingAPI.createBill(billData);
      toast.success('Bill saved successfully');
      useStore.getState().clearCart();
    } catch (error) {
      toast.error(error.response?.data?.message || error.message || 'Failed to save bill');
    }
  };

  const handleHoldBill = async () => {
    if (cart.length === 0) {
      toast.error('Add items before holding the bill');
      return;
    }

    try {
      await holdBillAPI.holdBill({
        invoiceNo: invoice,
        items: cart.map((item) => {
          const lineTotal = item.sellingPrice * item.quantity;
          const taxAmount = (lineTotal * (item.taxRate || 0)) / 100;
          return {
            productId: item._id,
            productName: item.name || item.productName,
            quantity: item.quantity,
            price: item.sellingPrice,
            tax: item.taxRate || 0,
            total: Number((lineTotal + taxAmount).toFixed(2)),
          };
        }),
        subtotal: totals.subtotal,
        discount: totals.discount,
        total: totals.total,
        paymentMethod: normalizePaymentMethod(paymentMethod),
        customerName: customerName || undefined,
        customerMobile: customerMobile || undefined,
      });
      toast.success('Bill held successfully');
      useStore.getState().clearCart();
    } catch (error) {
      toast.error(error.response?.data?.message || error.message || 'Failed to hold bill');
    }
  };

  const handlePrint = () => {
    if (cart.length === 0) {
      toast.error('Cannot print an empty bill');
      return;
    }
    window.print();
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <style>{`@media print { body * { visibility: hidden !important; } .invoice-preview, .invoice-preview * { visibility: visible !important; } .invoice-preview { position: absolute; left: 0; top: 0; width: 100%; } .no-print { display: none !important; } }`}</style>
      <div className="mx-auto flex min-h-screen max-w-[1600px] flex-col px-4 py-4 sm:px-6 lg:px-8">
        <header className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-slate-400">POS Billing</p>
              <h1 className="mt-2 text-2xl font-semibold">Invoice #{invoice}</h1>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{currentTime.toLocaleString()}</p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-200 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                onClick={() => window.close()}
              >
                <X size={16} /> Close
              </button>
            </div>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-[1.75fr_1fr]">
            <div>
              <ProductSearch onAddProduct={handleAddProduct} />
            </div>

            <div className="grid gap-3 rounded-3xl border border-slate-200 bg-slate-50 p-4 text-sm dark:border-slate-800 dark:bg-slate-950">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">Customer</span>
                <span className="rounded-full bg-slate-200 px-3 py-1 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">Walk-in</span>
              </div>
              <label className="block text-xs uppercase tracking-[0.2em] text-slate-500">Name</label>
              <input
                value={customerName}
                onChange={(e) => useStore.getState().setCustomerName(e.target.value)}
                className="input w-full text-sm"
                placeholder="Customer name"
              />
              <label className="mt-3 block text-xs uppercase tracking-[0.2em] text-slate-500">Mobile</label>
              <input
                value={customerMobile}
                onChange={(e) => useStore.getState().setCustomerMobile(e.target.value)}
                className="input w-full text-sm"
                placeholder="Mobile number"
              />
              <label className="mt-3 block text-xs uppercase tracking-[0.2em] text-slate-500">Payment</label>
              <select
                className="input w-full text-sm"
                value={paymentMethod}
                onChange={(e) => useStore.getState().setPaymentMethod(e.target.value)}
              >
                <option value="Cash">Cash</option>
                <option value="Card">Card</option>
                <option value="UPI">UPI</option>
              </select>
            </div>
          </div>
        </header>

        <main className="mt-6 grid gap-6 lg:grid-cols-[1.75fr_0.9fr]">
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between gap-3 pb-4">
              <div>
                <h2 className="text-lg font-semibold">Cart items</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">Search and add products to the cart.</p>
              </div>
              <div className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {cart.length} item{cart.length === 1 ? '' : 's'}
              </div>
            </div>

            <div className="overflow-hidden rounded-3xl border border-slate-200 dark:border-slate-800">
              <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.2em] text-slate-500 dark:bg-slate-950">
                  <tr>
                    <th className="px-4 py-3">Product</th>
                    <th className="px-4 py-3 text-right">Qty</th>
                    <th className="px-4 py-3 text-right">Price</th>
                    <th className="px-4 py-3 text-right">Tax</th>
                    <th className="px-4 py-3 text-right">Total</th>
                    <th className="px-4 py-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white dark:bg-slate-900 dark:divide-slate-800">
                  {cart.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="px-4 py-12 text-center text-slate-500 dark:text-slate-400">
                        Cart is empty. Use the search above to add items.
                      </td>
                    </tr>
                  ) : (
                    cart.map((item) => {
                      const itemTotal = item.sellingPrice * item.quantity;
                      const itemTax = ((item.sellingPrice * item.quantity) * (item.taxRate || 0)) / 100;
                      return (
                        <tr key={item._id} className="hover:bg-slate-50 dark:hover:bg-slate-800/70">
                          <td className="px-4 py-4">
                            <div className="font-semibold">{item.name}</div>
                            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{item.sku}</div>
                          </td>
                          <td className="px-4 py-4 text-right">
                            <div className="inline-flex items-center rounded-full bg-slate-100 p-1 text-slate-600 dark:bg-slate-800 dark:text-slate-200">
                              <button
                                type="button"
                                className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded"
                                onClick={() => useStore.getState().changeQty(item._id, -1)}
                              >
                                <Minus size={14} />
                              </button>
                              <span className="px-2 text-sm font-semibold">{item.quantity}</span>
                              <button
                                type="button"
                                className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded"
                                onClick={() => useStore.getState().changeQty(item._id, 1)}
                              >
                                <Plus size={14} />
                              </button>
                            </div>
                          </td>
                          <td className="px-4 py-4 text-right">{currency(item.sellingPrice)}</td>
                          <td className="px-4 py-4 text-right text-sm text-slate-500 dark:text-slate-400">{item.taxRate || 0}%</td>
                          <td className="px-4 py-4 text-right font-semibold">{currency(itemTotal + itemTax)}</td>
                          <td className="px-4 py-4 text-center">
                            <button
                              type="button"
                              className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-red-50 text-red-600 transition hover:bg-red-100 dark:bg-red-950 dark:text-red-300 dark:hover:bg-red-900"
                              onClick={() => useStore.getState().removeItem(item._id)}
                            >
                              <Trash2 size={16} />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <aside className="space-y-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div>
              <h2 className="text-lg font-semibold">Summary</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Review totals and complete the sale.</p>
            </div>
            <div className="space-y-3 rounded-3xl bg-slate-50 p-4 text-sm text-slate-600 dark:bg-slate-950 dark:text-slate-300">
              <div className="flex items-center justify-between">
                <span>Subtotal</span>
                <span className="font-semibold">{currency(totals.subtotal)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Tax</span>
                <span className="font-semibold">{currency(totals.taxTotal)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Discount</span>
                <span className="font-semibold">{currency(totals.discount)}</span>
              </div>
              <div className="border-t border-slate-200 pt-3 dark:border-slate-800">
                <div className="flex items-center justify-between text-sm font-semibold text-slate-900 dark:text-slate-100">
                  <span>Grand total</span>
                  <span>{currency(totals.total)}</span>
                </div>
              </div>
            </div>
            <div className="space-y-3 no-print">
              <button
                type="button"
                onClick={handleSaveBill}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700"
              >
                <Save size={16} /> Save Bill
              </button>
              <button
                type="button"
                onClick={handleHoldBill}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-slate-900"
              >
                <FolderPlus size={16} /> Hold Bill
              </button>
              <button
                type="button"
                onClick={handlePrint}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                <Printer size={16} /> Print
              </button>
            </div>

            <div className="invoice-preview rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900">
              <InvoicePreview
                sale={{
                  invoiceNumber: invoice,
                  createdAt: currentTime,
                  customerName,
                  customerMobile,
                  items: cart.map((item) => ({
                    name: item.name || item.productName,
                    quantity: item.quantity,
                    lineTotal: item.total ?? item.quantity * item.price,
                  })),
                  subtotal: totals.subtotal,
                  taxTotal: totals.taxTotal,
                  discount: totals.discount,
                  total: totals.total,
                  paymentMethod: normalizePaymentMethod(paymentMethod),
                }}
              />
            </div>
          </aside>
        </main>
      </div>
    </div>
  );
}
