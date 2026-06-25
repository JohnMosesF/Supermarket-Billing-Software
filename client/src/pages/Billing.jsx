import {
  CreditCard,
  FilePlus2,
  Hold,
  Printer,
  ReceiptText,
  RotateCcw,
  Search,
  Trash2,
  UserRound
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { api } from '../api/http.js';
import { productAPI } from '../billing/billingService.js';
import { InvoicePreview } from '../components/InvoicePreview.jsx';
import { currency, dateTime } from '../utils/format.js';
import { printInvoice, makeInvoiceHtmlFromSale } from '../utils/print.js';
import { useAuthStore } from '../store/authStore.js';

const paymentModes = [
  { value: 'cash', label: 'Cash' },
  { value: 'upi', label: 'UPI' },
  { value: 'card', label: 'Card' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'credit', label: 'Credit' }
];

function lineMath(item) {
  const gross = Number(item.price || 0) * parseFloat(item.quantity || 0);
  const discount = Number(item.discount || 0);
  const taxable = Math.max(gross - discount, 0);
  const gstAmount = (taxable * Number(item.taxRate || 0)) / 100;
  return { gross, discount, gstAmount, netAmount: taxable + gstAmount };
}

function makeDraftSale(cart, totals, paymentMethod, customer, settings) {
  return {
    invoiceNumber: 'PREVIEW',
    createdAt: new Date(),
    customerName: customer.name,
    customerMobile: customer.mobile,
    paymentMethod,
    subtotal: totals.subtotal,
    taxTotal: totals.gst,
    discount: totals.discount,
    total: totals.grandTotal,
    items: cart.map((item) => ({ ...item, lineTotal: lineMath(item).netAmount })),
    settings
  };
}

export function Billing() {
  const user = useAuthStore((state) => state.user);
  const codeRef = useRef(null);
  const nameRef = useRef(null);
  const customerRef = useRef(null);
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [cart, setCart] = useState([]);
  const [selectedRow, setSelectedRow] = useState(0);
  const [highlightedSuggestion, setHighlightedSuggestion] = useState(0);
  const [productCode, setProductCode] = useState('');
  const [query, setQuery] = useState('');
  const [entryQty, setEntryQty] = useState(1);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [paidAmount, setPaidAmount] = useState('');
  const [customer, setCustomer] = useState({ _id: null, name: '', mobile: '', address: '', outstandingBalance: 0, totalCredit: 0 });
  const [discount, setDiscount] = useState(0);
  const [sale, setSale] = useState(null);
  const [settings, setSettings] = useState(null);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    api.get('/settings', { silent: true }).then((res) => setSettings(res.data.settings)).catch(() => {});
    const clock = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(clock);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      const q = query || productCode;
      if (!q) {
        setProducts([]);
        return;
      }
      productAPI.searchProducts(q, 100).then((res) => {
        setProducts(res.data.products || []);
        setHighlightedSuggestion(0);
      }).catch(() => {
        setProducts([]);
      });
    }, 120);
    return () => clearTimeout(timer);
  }, [query, productCode]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!customer.name && !customer.mobile) {
        setCustomers([]);
        return;
      }
      api.get('/customers', { params: { search: customer.name || customer.mobile }, silent: true })
        .then((res) => setCustomers(res.data.customers.slice(0, 6)))
        .catch(() => {});
    }, 180);
    return () => clearTimeout(timer);
  }, [customer.name, customer.mobile]);

  // Calculate totals and other derived values based on cart and other inputs
  const totals = useMemo(() => {
    const subtotal = cart.reduce((sum, item) => sum + Number(item.price || 0) * parseFloat(item.quantity || 0), 0);
    const lineDiscount = cart.reduce((sum, item) => sum + Number(item.discount || 0), 0);
    const gst = cart.reduce((sum, item) => sum + lineMath(item).gstAmount, 0);
    const totalQuantity = cart.reduce((sum, item) => sum + parseFloat(item.quantity || 0), 0);
    const billDiscount = Number(discount || 0);
    const rawTotal = Math.max(subtotal + gst - lineDiscount - billDiscount, 0);
    return {
      items: cart.length,
      totalQuantity,
      subtotal,
      gst,
      discount: lineDiscount + billDiscount,
      roundOff: 0,
      grandTotal: rawTotal
    };
  }, [cart, discount]);

// Calculate payment and customer credit details  
  const paid = Number(paidAmount || 0);
  const balanceAmount = Math.max(totals.grandTotal - paid, 0);
  const changeReturn = Math.max(paid - totals.grandTotal, 0);
  const isCredit = paymentMethod === 'credit';
  const customerOutstanding = Number(customer.outstandingBalance || 0);
  const customerTotalCredit = Number(customer.totalCredit || 0);
  const customerCreditBills = customer.creditTransactions?.filter((tx) => Number(tx.dueAmount || 0) > 0) || [];
  const lastDue = customerCreditBills[0]?.dueAmount || 0;
  const activeProduct = products[highlightedSuggestion];
  const draftSale = sale || makeDraftSale(cart, totals, paymentMethod, customer, settings);

  function resetBill() {
    setCart([]);
    setSelectedRow(0);
    setProductCode('');
    setQuery('');
    setEntryQty(1);
    setDiscount(0);
    setPaidAmount('');
    setCustomer({ _id: null, name: '', mobile: '', address: '', outstandingBalance: 0, totalCredit: 0, creditTransactions: [] });
    setSale(null);
    codeRef.current?.focus();
  }

  function addProduct(product = activeProduct) {
    if (!product) return;
    if (product.stock <= 0) {
      toast.error('Product is out of stock');
      return;
    }
    const quantity = parseFloat(entryQty || 0);
    if (!product.allowDecimalQty && !Number.isInteger(quantity)) {
      toast.error(`${product.unit || 'pcs'} accepts whole number quantities only`);
      return;
    }

    setCart((items) => {
      const existing = items.find((item) => item._id === product._id);
      if (existing) {
        return items.map((item) => item._id === product._id
          ? { ...item, quantity: Math.min(parseFloat(item.quantity || 0) + parseFloat(entryQty || 0.001), Number(product.stock) )}
          : item);
      }
      return [
        ...items,
        {
          ...product,

          sku: product.sku,
          unit: product.unit || 'pcs',
          allowDecimalQty: product.allowDecimalQty || false,

          price: product.sellingPrice,
          quantity: Math.min(parseFloat(entryQty || 0.001), product.stock),

          discount: 0
        }
      ];
    });
    setSelectedRow(cart.length);
    setProductCode('');
    setQuery('');
    setEntryQty(1);
    codeRef.current?.focus();
  }

  function updateCartItem(productId, patch) {
    setCart((items) => items.map((item) => item._id === productId ? { ...item, ...patch } : item));
  }

  function deleteSelected() {
    if (!cart.length) return;
    setCart((items) => items.filter((_, index) => index !== selectedRow));
    setSelectedRow((row) => Math.max(0, row - 1));
  }

  async function checkout() {
    if (!cart.length) {
      toast.error('Add products to cart first');
      return;
    }

    if (paymentMethod === 'credit' && !customer.mobile) {
      toast.error('Customer mobile is required for credit sales');
      return;
    }
    if (paid < 0) {
      toast.error('Amount paid cannot be negative');
      return;
    }
    if (paymentMethod === 'credit' && paid > totals.grandTotal) {
      toast.error('Amount paid cannot exceed bill total for credit sales');
      return;
    }

    const { data } = await api.post('/sales', {
      items: cart.map((item) => ({
        product: item._id,
        quantity: parseFloat(item.quantity),
        unit: item.unit || 'pcs',
        price: Number(item.price),
        discount: Number(item.discount || 0)
      })),
      paymentMethod,
      paymentStatus: paymentMethod === 'credit' ? 'pending' : 'paid',
      paidAmount: paymentMethod === 'credit' ? paid : Math.max(paid, totals.grandTotal),
      customer: customer._id,
      customerName: customer.name,
      customerMobile: customer.mobile,
      customerAddress: customer.address,
      discount: Number(discount || 0)
    });

    setSale(data.sale);
    console.log('Checkout completed - cart items:', cart);
    console.log('Generated sale object:', data.sale);
    console.log('Customer object:', customer);
    toast.success('Invoice generated');
    return data.sale;
  }

  async function handlePrint() {
    let saleToPrint = sale;
    if (!saleToPrint) {
      saleToPrint = await checkout();
    }
    if (!saleToPrint || !saleToPrint.items?.length) {
      toast.error('No printable invoice data found');
      return;
    }

    const invoiceHtml = makeInvoiceHtmlFromSale(
      saleToPrint,
      settings
    );

    const result = await printInvoice(invoiceHtml, {
      silent: settings?.silentPrinting !== false,
      printBackground: true,
      copies: Number(settings?.numberOfCopies || 1),
      deviceName: settings?.printerName || undefined,
      meta: { storeName: settings?.storeName, gst: settings?.gstNumber, invoiceNo: saleToPrint.invoiceNumber || saleToPrint.invoiceNo }
    });
    if (!result || !result.ok) {
      console.error('Print failed:', result && result.error ? result.error : result);
      toast.error(`Printing failed: ${result && result.error ? result.error : 'Unknown error'}`);
    } else {
      toast.success('Print sent to printer');
    }
  }

  const handleShortcuts = useCallback((event) => {
    if (event.key === 'F1') {
      event.preventDefault();
      resetBill();
    }
    if (event.key === 'F2') {
      event.preventDefault();
      customerRef.current?.focus();
    }
    if (event.key === 'F3') {
      event.preventDefault();
      toast('Bill search is ready for invoice history workflow.');
    }
    if (event.key === 'F4') {
      event.preventDefault();
      toast.success('Bill held locally for this session');
    }
    if (event.key === 'F8') {
      event.preventDefault();
      handlePrint();
    }
    if (event.key === 'Delete') {
      event.preventDefault();
      deleteSelected();
    }
    if (event.key === 'ArrowDown' && document.activeElement === nameRef.current) {
      event.preventDefault();
      setHighlightedSuggestion((index) => Math.min(index + 1, products.length - 1));
    }
    if (event.key === 'ArrowUp' && document.activeElement === nameRef.current) {
      event.preventDefault();
      setHighlightedSuggestion((index) => Math.max(index - 1, 0));
    }
    if (event.key === 'Enter' && document.activeElement === nameRef.current) {
      event.preventDefault();
      addProduct(activeProduct);
    }
  }, [activeProduct, cart.length, products.length, selectedRow, sale, totals.grandTotal, paid, paymentMethod]);

  useEffect(() => {
    window.addEventListener('keydown', handleShortcuts);
    return () => window.removeEventListener('keydown', handleShortcuts);
  }, [handleShortcuts]);

  return (
    <div className="-m-4 min-h-[calc(100vh-5rem)] bg-slate-100 pb-20 text-slate-950 dark:bg-slate-950 dark:text-slate-100 sm:-m-6">
      <div className="sticky top-0 z-20 border-b border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-900 lg:px-6">
        <div className="grid gap-3 lg:grid-cols-[1fr_1.2fr_1fr] lg:items-center">
          <div>
            <p className="text-lg font-bold text-blue-700 dark:text-blue-300">POS Billing System</p>
            <p className="text-xs text-slate-500">{settings?.storeName || 'StoreDesk Supermarket'} | Cashier: {user?.name || 'Staff'}</p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="rounded-lg bg-slate-100 p-2 dark:bg-slate-800"><span className="block text-slate-500">Invoice</span><strong>{sale?.invoiceNumber || 'Draft'}</strong></div>
            <div className="rounded-lg bg-slate-100 p-2 dark:bg-slate-800"><span className="block text-slate-500">Date</span><strong>{now.toLocaleDateString('en-IN')}</strong></div>
            <div className="rounded-lg bg-slate-100 p-2 dark:bg-slate-800"><span className="block text-slate-500">Time</span><strong>{now.toLocaleTimeString('en-IN')}</strong></div>
          </div>
          <div className="grid grid-cols-3 gap-2 text-right">
            <div className="col-span-2 rounded-lg bg-blue-700 p-3 text-white">
              <span className="block text-xs text-blue-100">Total Amount</span>
              <strong className="text-3xl">{currency(totals.grandTotal)}</strong>
            </div>
            <div className="rounded-lg bg-slate-100 p-3 dark:bg-slate-800">
              <span className="block text-xs text-slate-500">Items / Qty</span>
              <strong className="text-xl">{totals.items} / {totals.totalQuantity}</strong>
               </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 p-4 xl:grid-cols-[minmax(0,7fr)_minmax(360px,3fr)]">
        <section className="min-w-0 space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="grid gap-2 xl:grid-cols-[120px_minmax(220px,1fr)_100px_80px_80px_120px_90px]">
              <label className="text-xs font-semibold uppercase text-slate-500">
                Product Code
                <input ref={codeRef} className="input mt-1 h-11" value={productCode} onChange={(event) => setProductCode(event.target.value)} placeholder="Scan" />
              </label>
              <label className="relative text-xs font-semibold uppercase text-slate-500">
                Product Name Search
                <div className="relative mt-1">
                  <Search className="absolute left-3 top-3 text-slate-400" size={17} />
                  <input ref={nameRef} className="input h-11 pl-10" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Type name or barcode" />
                </div>
                {(query || productCode) && products.length ? (
                  <div className="absolute left-0 right-0 top-[4.5rem] z-30 max-h-72 overflow-auto rounded-lg border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
                    {products.map((product, index) => (
                      <button
                        key={product._id}
                        type="button"
                        onMouseEnter={() => setHighlightedSuggestion(index)}
                        onClick={() => addProduct(product)}
                        className={`grid w-full grid-cols-[1fr_auto] gap-3 px-3 py-2 text-left text-sm ${highlightedSuggestion === index ? 'bg-blue-50 text-blue-800 dark:bg-blue-950/50 dark:text-blue-200' : 'hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                      >
                        <span><strong>{product.name}</strong><span className="block text-xs text-slate-500">{product.sku} | Stock {product.stock}</span></span>
                        <strong>{currency(product.sellingPrice)}</strong>
                      </button>
                    ))}
                  </div>
                ) : null}
              </label>
              <label className="text-xs font-semibold uppercase text-slate-500">
                Rate
                <input className="input mt-1 h-11" value={activeProduct?.sellingPrice || ''} readOnly />
              </label>
              <label className="text-xs font-semibold uppercase text-slate-500">
                Qty
                <input
                  className="input mt-1 h-11"
                  type="number"
                  min="0.001"
                  step="0.001"
                  value={entryQty}
                  onChange={(event) => {
                    const value = parseFloat(event.target.value) || 0.001;
                    setEntryQty(activeProduct?.allowDecimalQty === false ? Math.max(1, Math.trunc(value)) : value);
                  }}
                />
              </label>
              <label className="text-xs font-semibold uppercase text-slate-500">
                GST
                <input className="input mt-1 h-11" value={activeProduct?.taxRate ?? ''} readOnly />
              </label>
              <label className="text-xs font-semibold uppercase text-slate-500">
                Net Amount
                <input className="input mt-1 h-11 font-bold" value={activeProduct ? currency((activeProduct.sellingPrice * entryQty) * (1 + (activeProduct.taxRate || 0) / 100)) : ''} readOnly />
              </label>
              <button type="button" className="mt-5 h-11 rounded-lg bg-green-600 px-4 text-sm font-bold text-white hover:bg-green-700" onClick={() => addProduct()}>
                Add
              </button>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="max-h-[calc(100vh-290px)] min-h-[310px] overflow-auto">
              <table className="w-full min-w-[980px] border-separate border-spacing-0 text-sm">
                <thead className="sticky top-0 z-10 bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-800">
                  <tr>
                    {['Select', 'Product Code', 'Product Name', 'Rate', 'Qty', 'Unit', 'GST%', 'GST Amount', 'Discount', 'Net Amount'].map((heading) => (
                      <th key={heading} className="border-b border-slate-200 px-3 py-3 text-left font-bold dark:border-slate-700">{heading}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {cart.map((item, index) => {
                    const math = lineMath(item);
                    const selected = selectedRow === index;
                    return (
                      <tr key={item._id} onClick={() => setSelectedRow(index)} className={`${selected ? 'bg-blue-50 text-blue-950 ring-1 ring-inset ring-blue-300 dark:bg-blue-950/40 dark:text-blue-100' : index % 2 ? 'bg-slate-50/70 dark:bg-slate-900' : 'bg-white dark:bg-slate-950'} cursor-default`}>
                        <td className="border-b border-slate-100 px-3 py-2 dark:border-slate-800"><input type="radio" checked={selected} onChange={() => setSelectedRow(index)} /></td>
                        <td className="border-b border-slate-100 px-3 py-2 font-mono dark:border-slate-800">{item.sku}</td>
                        <td className="border-b border-slate-100 px-3 py-2 font-semibold dark:border-slate-800">{item.name}</td>
                        <td className="border-b border-slate-100 px-3 py-2 dark:border-slate-800">
                          <input className="h-9 w-24 rounded-md border border-slate-200 px-2 text-right dark:border-slate-700 dark:bg-slate-900" type="number" step="0.01" value={item.price} onChange={(event) => updateCartItem(item._id, { price: Number(event.target.value) })} />
                        </td>
                        <td className="border-b border-slate-100 px-3 py-2 dark:border-slate-800">
                          <input className="h-9 w-20 rounded-md border border-slate-200 px-2 text-right dark:border-slate-700 dark:bg-slate-900" type="number" min={item.allowDecimalQty ? '0.001' : '1'} step={item.allowDecimalQty ? '0.001' : '1'} value={item.quantity} onChange={(event) => {
                            const value = parseFloat(event.target.value) || 0;
                            updateCartItem(item._id, { quantity: item.allowDecimalQty ? value : Math.max(1, Math.trunc(value)) });
                          }} />
                        </td>
                        <td className="border-b border-slate-100 px-3 py-2 dark:border-slate-800">{item.unit || 'pcs'}</td>
                        <td className="border-b border-slate-100 px-3 py-2 dark:border-slate-800">{item.taxRate || 0}</td>
                        <td className="border-b border-slate-100 px-3 py-2 text-right dark:border-slate-800">{currency(math.gstAmount)}</td>
                        <td className="border-b border-slate-100 px-3 py-2 dark:border-slate-800">
                          <input className="h-9 w-24 rounded-md border border-slate-200 px-2 text-right dark:border-slate-700 dark:bg-slate-900" type="number" step="0.01" value={item.discount} onChange={(event) => updateCartItem(item._id, { discount: Number(event.target.value) })} />
                        </td>
                        <td className="border-b border-slate-100 px-3 py-2 text-right font-bold dark:border-slate-800">{currency(math.netAmount)}</td>
                      </tr>
                    );
                  })}
                  {!cart.length ? (
                    <tr>
                      <td colSpan="9" className="px-4 py-16 text-center text-slate-500">Scan or search a product to start billing.</td>
                    </tr>
                  ) : null}
                </tbody>
                <tfoot className="sticky bottom-0 bg-slate-100 font-bold dark:bg-slate-800">
                  <tr>
                    <td colSpan="4" className="px-3 py-3">Totals</td>
                    <td className="px-3 py-3">{totals.totalQuantity}</td>
                    <td></td>
                    <td className="px-3 py-3 text-right">{currency(totals.gst)}</td>
                    <td className="px-3 py-3 text-right">{currency(totals.discount)}</td>
                    <td className="px-3 py-3 text-right">{currency(totals.grandTotal)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </section>

        <aside className="space-y-4">
          <div className="rounded-xl border border-blue-100 bg-white p-4 shadow-sm dark:border-blue-900 dark:bg-slate-900">
            <h2 className="mb-3 flex items-center gap-2 font-bold"><ReceiptText size={18} />Bill Summary</h2>
            <div className="space-y-2 text-sm">
              <p className="flex justify-between"><span>Items</span><strong>{totals.items}</strong></p>
              <p className="flex justify-between"><span>Quantity</span><strong>{totals.totalQuantity}</strong></p>
              <p className="flex justify-between"><span>Subtotal</span><strong>{currency(totals.subtotal)}</strong></p>
              <p className="flex justify-between"><span>GST</span><strong>{currency(totals.gst)}</strong></p>
              <p className="flex justify-between"><span>Discount</span><strong>{currency(totals.discount)}</strong></p>
              <p className="flex justify-between"><span>Round Off</span><strong>{currency(totals.roundOff)}</strong></p>
            </div>
            <div className="mt-4 rounded-xl bg-blue-700 p-4 text-white">
              <span className="text-sm text-blue-100">Grand Total</span>
              <p className="text-4xl font-black">{currency(totals.grandTotal)}</p>
            </div>
          </div>

          <div className="relative overflow-visible rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h2 className="mb-3 flex items-center gap-2 font-bold"><UserRound size={18} />Customer Details</h2>
            <div className="grid gap-3">
              <input ref={customerRef} className="input h-11" placeholder="Customer Name" value={customer.name} onChange={(event) => setCustomer((value) => ({ ...value, _id: null, name: event.target.value }))} />
              <input className="input h-11" placeholder="Mobile Number" value={customer.mobile} onChange={(event) => setCustomer((value) => ({ ...value, _id: null, mobile: event.target.value }))} />
              <textarea className="input min-h-20 resize-y" placeholder="Address" value={customer.address} onChange={(event) => setCustomer((value) => ({ ...value, address: event.target.value }))} />

              {customers.length ? (
                <div className="absolute left-4 right-4 top-28 z-30 rounded-lg border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
                  {customers.map((item) => (
                    <button
                      key={item._id}
                      className="block w-full px-3 py-2 text-left text-sm hover:bg-blue-50 dark:hover:bg-slate-800"
                      onClick={() => {
                        setCustomer({
                          _id: item._id,
                          name: item.name,
                          mobile: item.mobile,
                          address: item.address || '',
                          outstandingBalance: item.outstandingBalance || 0,
                          totalCredit: item.totalCredit || 0,
                          totalPaid: item.totalPaid || 0,
                          creditTransactions: item.creditTransactions || []
                        });
                        setCustomers([]);
                      }}
                    >
                      <strong>{item.name}</strong>
                      <span className="block text-xs text-slate-500">{item.mobile} | Due {currency(item.outstandingBalance || 0)}</span>
                    </button>
                  ))}
                </div>
              ) : null}

              <div className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-950">
                <div className="flex items-center gap-2 text-sm font-bold"><CreditCard size={16} />Payment Method</div>
                <div className="grid grid-cols-2 gap-2 2xl:grid-cols-5">
                  {paymentModes.map((mode) => (
                    <button key={mode.value} className={`min-h-11 rounded-lg px-2 text-sm font-bold ${paymentMethod === mode.value ? 'bg-blue-700 text-white' : 'bg-white text-slate-700 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700'}`} onClick={() => setPaymentMethod(mode.value)}>
                      {mode.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs font-semibold uppercase text-slate-500">
                  Discount
                  <input className="input mt-1 h-11" type="number" min="0" step="0.01" value={discount} onChange={(event) => setDiscount(Math.max(0, Number(event.target.value)))} />
                </label>
                <label className="text-xs font-semibold uppercase text-slate-500">
                  Paid Amount
                  <input
                    className="input mt-1 h-11 text-lg font-bold"
                    type="number"
                    min="0"
                    step="0.01"
                    max={isCredit ? totals.grandTotal : undefined}
                    value={paidAmount}
                    onChange={(event) => {
                      const value = Math.max(0, Number(event.target.value));
                      setPaidAmount(String(isCredit ? Math.min(value, totals.grandTotal) : value));
                    }}
                    placeholder={String(totals.grandTotal)}
                  />
                </label>
              </div>

              {isCredit ? (
                <div className="rounded-xl border border-orange-200 bg-orange-50 p-3 text-orange-900">
                  <p className="mb-2 text-sm font-black">Credit Information</p>
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <div><span className="block text-xs">Bill Amount</span><strong>{currency(totals.grandTotal)}</strong></div>
                    <div><span className="block text-xs">Amount Paid</span><strong>{currency(paid)}</strong></div>
                    <div><span className="block text-xs">Remaining Due</span><strong>{currency(balanceAmount)}</strong></div>
                  </div>
                  <p className="mt-2 text-xs">Credit sales require customer name and mobile. Amount paid cannot exceed bill total.</p>
                </div>
              ) : null}

              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-orange-50 p-3 text-orange-800"><span className="text-xs">Outstanding Balance</span><strong className="block text-lg">{currency(customerOutstanding)}</strong></div>
                <div className="rounded-lg bg-blue-50 p-3 text-blue-800"><span className="text-xs">Previous Credit Bills</span><strong className="block text-lg">{customerCreditBills.length}</strong></div>
                <div className="rounded-lg bg-slate-50 p-3 text-slate-800"><span className="text-xs">Last Due Amount</span><strong className="block text-lg">{currency(lastDue)}</strong></div>
                <div className="rounded-lg bg-green-50 p-3 text-green-800"><span className="text-xs">Change Return</span><strong className="block text-lg">{currency(changeReturn)}</strong></div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-bold">Invoice Preview</h2>
              <button className="rounded-lg bg-green-600 px-3 py-2 text-sm font-bold text-white" onClick={handlePrint}><Printer size={16} className="inline" /> Print</button>
            </div>
            <div className="max-h-72 overflow-auto rounded-lg bg-slate-50 p-2 dark:bg-slate-950">
              <InvoicePreview sale={draftSale} settings={settings} />
            </div>
          </div>
        </aside>
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-slate-200 bg-white px-4 py-2 shadow-[0_-8px_30px_rgba(15,23,42,0.08)] dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button className="btn-muted" onClick={resetBill}><FilePlus2 size={16} />F1 New</button>
          <button className="btn-primary" onClick={checkout}>Save Bill</button>
          <button className="rounded-md bg-orange-500 px-4 py-2 text-sm font-bold text-white"><Hold size={16} className="inline" /> F4 Hold</button>
          <button className="btn-muted"><RotateCcw size={16} />Recall Hold</button>
          <button className="rounded-md bg-green-600 px-4 py-2 text-sm font-bold text-white" onClick={handlePrint}><Printer size={16} className="inline" />F8 Print</button>
          <button className="rounded-md bg-red-600 px-4 py-2 text-sm font-bold text-white" onClick={deleteSelected}><Trash2 size={16} className="inline" />Del Remove</button>
          <button className="btn-muted" onClick={() => customerRef.current?.focus()}><UserRound size={16} />F2 Customer</button>
          <button className="btn-muted"><Search size={16} />F3 Search Bill</button>
        </div>
      </div>
    </div>
  );
}
