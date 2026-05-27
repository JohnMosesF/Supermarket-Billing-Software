import { Minus, Plus, Printer, Search, ShoppingCart, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { api } from '../api/http.js';
import { InvoicePreview } from '../components/InvoicePreview.jsx';
import { PageHeader } from '../components/PageHeader.jsx';
import { currency } from '../utils/format.js';
import { printInvoice } from '../utils/print.js';

export function Billing() {
  const searchRef = useRef(null);
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [query, setQuery] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [customerMobile, setCustomerMobile] = useState('');
  const [discount, setDiscount] = useState(0);
  const [sale, setSale] = useState(null);
  const [settings, setSettings] = useState(null);

  useEffect(() => {
    api.get('/settings', { silent: true }).then((res) => setSettings(res.data.settings)).catch(() => {});
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      api.get('/products', { params: { search: query, limit: 24 } }).then((res) => setProducts(res.data.products));
    }, 160);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    function shortcuts(event) {
      if (event.key === 'F2') {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key === 'F4') {
        event.preventDefault();
        checkout();
      }
    }
    window.addEventListener('keydown', shortcuts);
    return () => window.removeEventListener('keydown', shortcuts);
  });

  const totals = useMemo(() => {
    const subtotal = cart.reduce((sum, item) => sum + item.sellingPrice * item.quantity, 0);
    const taxTotal = cart.reduce((sum, item) => sum + ((item.sellingPrice * item.quantity) * (item.taxRate || 0)) / 100, 0);
    return { subtotal, taxTotal, total: Math.max(subtotal + taxTotal - Number(discount || 0), 0) };
  }, [cart, discount]);

  function addProduct(product) {
    if (product.stock <= 0) {
      toast.error('Product is out of stock');
      return;
    }
    setCart((items) => {
      const existing = items.find((item) => item._id === product._id);
      if (existing) {
        return items.map((item) => item._id === product._id ? { ...item, quantity: Math.min(item.quantity + 1, product.stock) } : item);
      }
      return [...items, { ...product, quantity: 1 }];
    });
    setQuery('');
    searchRef.current?.focus();
  }

  function changeQty(productId, delta) {
    setCart((items) => items
      .map((item) => item._id === productId ? { ...item, quantity: Math.max(1, Math.min(item.stock, item.quantity + delta)) } : item)
    );
  }

  async function checkout() {
    if (!cart.length) {
      toast.error('Add products to cart first');
      return;
    }
    const { data } = await api.post('/sales', {
      items: cart.map((item) => ({ product: item._id, quantity: item.quantity })),
      paymentMethod,
      customerMobile,
      discount: Number(discount || 0)
    });
    setSale(data.sale);
    setCart([]);
    setDiscount(0);
    setCustomerMobile('');
    toast.success('Invoice generated');
  }

  async function handlePrint() {
    await printInvoice(document.getElementById('invoice-print')?.outerHTML);
  }

  return (
    <div>
      <PageHeader
        title="Billing POS"
        description="Fast billing with keyboard shortcuts, GST calculation, and thermal invoice printing."
        actions={<button className="btn-muted" onClick={() => searchRef.current?.focus()}><Search size={17} />F2 Search</button>}
      />

      <div className="grid gap-5 xl:grid-cols-[1fr_430px]">
        <div className="space-y-5">
          <div className="panel p-4">
            <div className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 dark:border-slate-700">
              <Search size={18} className="text-slate-400" />
              <input
                ref={searchRef}
                className="w-full bg-transparent text-sm outline-none"
                placeholder="Scan barcode or search product"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {products.map((product) => (
                <button key={product._id} onClick={() => addProduct(product)} className="rounded-md border border-slate-200 p-3 text-left transition hover:border-leaf hover:bg-emerald-50 dark:border-slate-800 dark:hover:bg-emerald-950/30">
                  <p className="font-semibold">{product.name}</p>
                  <p className="text-xs text-slate-500">{product.sku} | Stock {product.stock}</p>
                  <p className="mt-2 font-bold text-leaf">{currency(product.sellingPrice)}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="panel overflow-hidden">
            <div className="flex items-center gap-2 border-b border-slate-100 p-4 dark:border-slate-800">
              <ShoppingCart size={18} />
              <h2 className="font-semibold">Cart</h2>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {cart.map((item) => (
                <div key={item._id} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 p-4">
                  <div>
                    <p className="font-semibold">{item.name}</p>
                    <p className="text-sm text-slate-500">{currency(item.sellingPrice)} + GST {item.taxRate || 0}%</p>
                  </div>
                  <div className="flex items-center rounded-md border border-slate-200 dark:border-slate-700">
                    <button className="p-2" onClick={() => changeQty(item._id, -1)}><Minus size={15} /></button>
                    <span className="w-8 text-center text-sm font-bold">{item.quantity}</span>
                    <button className="p-2" onClick={() => changeQty(item._id, 1)}><Plus size={15} /></button>
                  </div>
                  <button className="btn-muted h-9 w-9 p-0" onClick={() => setCart((items) => items.filter((cartItem) => cartItem._id !== item._id))}>
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
              {!cart.length ? <p className="p-5 text-sm text-slate-500">Cart is empty.</p> : null}
            </div>
          </div>
        </div>

        <div className="space-y-5">
          <div className="panel p-5">
            <h2 className="mb-4 font-semibold">Payment</h2>
            <label className="mb-1 block text-sm font-medium">Customer mobile</label>
            <input className="input mb-3" value={customerMobile} onChange={(event) => setCustomerMobile(event.target.value)} placeholder="Optional" />
            <label className="mb-1 block text-sm font-medium">Discount</label>
            <input className="input mb-4" type="number" value={discount} onChange={(event) => setDiscount(event.target.value)} />
            <div className="mb-4 grid grid-cols-3 gap-2">
              {['cash', 'upi', 'card'].map((method) => (
                <button key={method} className={paymentMethod === method ? 'btn-primary capitalize' : 'btn-muted capitalize'} onClick={() => setPaymentMethod(method)}>
                  {method}
                </button>
              ))}
            </div>
            <div className="space-y-2 rounded-md bg-slate-50 p-4 text-sm dark:bg-slate-800">
              <p className="flex justify-between"><span>Subtotal</span><strong>{currency(totals.subtotal)}</strong></p>
              <p className="flex justify-between"><span>GST</span><strong>{currency(totals.taxTotal)}</strong></p>
              <p className="flex justify-between"><span>Discount</span><strong>{currency(discount)}</strong></p>
              <p className="flex justify-between border-t border-slate-200 pt-2 text-lg dark:border-slate-700"><span>Total</span><strong>{currency(totals.total)}</strong></p>
            </div>
            <button className="btn-primary mt-4 w-full" onClick={checkout}>Generate Invoice (F4)</button>
          </div>

          {sale ? (
            <div className="panel p-5">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-semibold">Invoice preview</h2>
                <button className="btn-primary" onClick={handlePrint}><Printer size={17} />Print</button>
              </div>
              <InvoicePreview sale={sale} settings={settings} />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
