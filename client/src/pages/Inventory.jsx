import { RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { api } from '../api/http.js';
import { PageHeader } from '../components/PageHeader.jsx';
import { dateTime } from '../utils/format.js';

export function Inventory() {
  const [logs, setLogs] = useState([]);
  const [products, setProducts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const { register, handleSubmit, reset } = useForm();
  const purchaseForm = useForm();

  async function load() {
    const [logRes, productRes, supplierRes] = await Promise.all([
      api.get('/inventory/logs'),
      api.get('/products', { params: { limit: 100 } }),
      api.get('/suppliers', { silent: true }).catch(() => ({ data: { suppliers: [] } }))
    ]);
    setLogs(logRes.data.logs);
    setProducts(productRes.data.products);
    setSuppliers(supplierRes.data.suppliers);
  }

  useEffect(() => { load(); }, []);

  async function adjust(values) {
    await api.post('/inventory/adjust', { ...values, quantity: Number(values.quantity) });
    toast.success('Stock adjusted');
    reset();
    load();
  }

  async function purchase(values) {
    await api.post('/purchases', {
      supplier: values.supplier || undefined,
      invoiceNumber: values.invoiceNumber,
      items: [{ product: values.product, quantity: Number(values.quantity), costPrice: Number(values.costPrice) }]
    });
    toast.success('Purchase entry saved');
    purchaseForm.reset();
    load();
  }

  return (
    <div>
      <PageHeader title="Inventory" description="Track stock in, stock out, manual adjustments, and low-stock movement history." />
      <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
        <div className="space-y-5">
          <form className="panel space-y-3 p-5" onSubmit={handleSubmit(adjust)}>
            <h2 className="font-semibold">Manual adjustment</h2>
            <select className="input" {...register('product', { required: true })}>
              <option value="">Select product</option>
              {products.map((product) => <option key={product._id} value={product._id}>{product.name} ({product.stock})</option>)}
            </select>
            <input className="input" type="number" placeholder="+10 or -5" {...register('quantity', { required: true })} />
            <input className="input" placeholder="Reason" {...register('reason', { required: true })} />
            <button className="btn-primary w-full"><RefreshCw size={17} />Apply</button>
          </form>

          <form className="panel space-y-3 p-5" onSubmit={purchaseForm.handleSubmit(purchase)}>
            <h2 className="font-semibold">Purchase stock in</h2>
            <select className="input" {...purchaseForm.register('supplier')}>
              <option value="">No supplier</option>
              {suppliers.map((supplier) => <option key={supplier._id} value={supplier._id}>{supplier.name}</option>)}
            </select>
            <select className="input" {...purchaseForm.register('product', { required: true })}>
              <option value="">Select product</option>
              {products.map((product) => <option key={product._id} value={product._id}>{product.name}</option>)}
            </select>
            <input className="input" placeholder="Supplier invoice" {...purchaseForm.register('invoiceNumber')} />
            <input className="input" type="number" placeholder="Quantity" {...purchaseForm.register('quantity', { required: true })} />
            <input className="input" type="number" step="0.01" placeholder="Cost price" {...purchaseForm.register('costPrice', { required: true })} />
            <button className="btn-primary w-full">Save purchase</button>
          </form>
        </div>

        <div className="panel overflow-hidden">
          <table className="w-full">
            <thead>
              <tr><th className="table-th">Product</th><th className="table-th">Type</th><th className="table-th">Qty</th><th className="table-th">Stock</th><th className="table-th">Date</th></tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log._id}>
                  <td className="table-td"><strong>{log.product?.name}</strong><p className="text-xs text-slate-500">{log.reason}</p></td>
                  <td className="table-td">{log.type}</td>
                  <td className="table-td">{log.quantity} {log.product?.unit || ''}</td>
                  <td className="table-td">{log.stockBefore} to {log.stockAfter} {log.product?.unit || ''}</td>
                  <td className="table-td">{dateTime(log.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
