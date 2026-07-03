import { Edit2, Plus, Printer, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { api } from '../api/http.js';
import { PageHeader } from '../components/PageHeader.jsx';
import { currency, dateTime } from '../utils/format.js';

const blankRow = {
  product: '',
  name: '',
  quantity: 1,
  unit: 'pcs',
  costPrice: 0,
  gstRate: 0,
  mrp: 0,
  sellingPrice: 0
};

export function Purchases() {
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [units, setUnits] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [editing, setEditing] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [supplierDetails, setSupplierDetails] = useState(null);
  const [form, setForm] = useState({
    supplier: '',
    invoiceNumber: '',
    purchaseDate: new Date().toISOString().slice(0, 10),
    rows: [{ ...blankRow }]
  });

  async function load() {
    const [supplierRes, productRes, unitRes, purchaseRes] = await Promise.all([
      api.get('/suppliers'),
      api.get('/products', { params: { limit: 5000 } }),
      api.get('/units'),
      api.get('/purchases')
    ]);
    setSuppliers(supplierRes.data.suppliers || []);
    setProducts(productRes.data.products || []);
    setUnits(unitRes.data.units || []);
    setPurchases(purchaseRes.data.purchases || []);
  }

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!form.supplier) {
      setSupplierDetails(null);
      return;
    }
    const supplier = suppliers.find((item) => item._id === form.supplier);
    setSupplierDetails(supplier || null);
  }, [form.supplier, suppliers]);

  const summary = useMemo(() => {
    const subtotal = form.rows.reduce((sum, row) => sum + Number(row.quantity || 0) * Number(row.costPrice || 0), 0);
    const gstTotal = form.rows.reduce((sum, row) => sum + (Number(row.quantity || 0) * Number(row.costPrice || 0) * Number(row.gstRate || 0) / 100), 0);
    const totalItems = form.rows.filter((row) => Number(row.quantity || 0) > 0).length;
    const totalQty = form.rows.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
    return { subtotal, gstTotal, totalItems, totalQty, grandTotal: subtotal + gstTotal };
  }, [form.rows]);

  function updateRow(index, patch) {
    setForm((current) => ({
      ...current,
      rows: current.rows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row))
    }));
  }

  function selectProduct(index, productId) {
    if (productId === '__new__') {
      updateRow(index, { product: '', name: '', costPrice: 0, gstRate: 0, mrp: 0, sellingPrice: 0 });
      return;
    }
    const product = products.find((item) => item._id === productId);
    updateRow(index, {
      product: productId,
      name: product?.name || '',
      unit: product?.unit || 'pcs',
      costPrice: product?.purchasePrice || 0,
      gstRate: product?.taxRate || 0,
      mrp: product?.mrp || 0,
      sellingPrice: product?.sellingPrice || 0
    });
  }

  function addRow() {
    setForm((current) => ({ ...current, rows: [...current.rows, { ...blankRow }] }));
  }

  function clearForm() {
    setEditing(null);
    setForm({ supplier: '', invoiceNumber: '', purchaseDate: new Date().toISOString().slice(0, 10), rows: [{ ...blankRow }] });
  }

  async function savePurchase(event) {
    event.preventDefault();
    try {
      const items = form.rows.map((row) => ({
        product: row.product || undefined,
        name: row.product ? undefined : row.name,
        quantity: Number(row.quantity || 0),
        unit: row.unit || 'pcs',
        costPrice: Number(row.costPrice || 0),
        gstRate: Number(row.gstRate || 0),
        mrp: Number(row.mrp || 0),
        sellingPrice: Number(row.sellingPrice || 0)
      }));
      const payload = {
        supplier: form.supplier || undefined,
        invoiceNumber: form.invoiceNumber,
        purchaseDate: form.purchaseDate,
        items
      };

      if (editing) {
        await api.put(`/purchases/${editing._id}`, payload);
        toast.success('Purchase updated');
      } else {
        await api.post('/purchases', payload);
        toast.success('Purchase saved');
      }

      clearForm();
      await load();
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to save purchase');
    }
  }

  async function editPurchase(purchase) {
    const { data } = await api.get(`/purchases/${purchase._id}`);
    const record = data.purchase;
    setEditing(record);
    setForm({
      supplier: record.supplier?._id || record.supplier || '',
      invoiceNumber: record.invoiceNumber || '',
      purchaseDate: String(record.purchaseDate || record.createdAt).slice(0, 10),
      rows: (record.items || []).map((item) => ({
        product: item.product?._id || item.product || '',
        name: item.name || item.product?.name || '',
        quantity: item.quantity || 1,
        unit: item.unit || item.product?.unit || 'pcs',
        costPrice: item.costPrice || 0,
        gstRate: item.gstRate || 0,
        mrp: item.mrp || item.product?.mrp || 0,
        sellingPrice: item.sellingPrice || item.product?.sellingPrice || 0
      }))
    });
  }

  async function viewPurchase(purchase) {
    const { data } = await api.get(`/purchases/${purchase._id}`);
    setViewing(data.purchase);
    return data.purchase;
  }

  async function deletePurchase(purchase) {
    if (!window.confirm(`Soft delete purchase ${purchase.invoiceNumber || purchase._id}?`)) return;
    await api.delete(`/purchases/${purchase._id}`);
    toast.success('Purchase removed');
    await load();
  }

  function printPurchase(purchase = viewing) {
    if (!purchase) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    const rows = (purchase.items || []).map((item) => `<tr><td>${item.name}</td><td>${item.quantity} ${item.unit || ''}</td><td>${Number(item.costPrice || 0).toFixed(2)}</td><td>${Number(item.gstRate || 0)}%</td><td>${Number(item.lineTotal || 0).toFixed(2)}</td></tr>`).join('');
    printWindow.document.write(`<html><body><h2>Purchase ${purchase.invoiceNumber || purchase._id}</h2><p>Date: ${new Date(purchase.purchaseDate || purchase.createdAt).toLocaleString()}</p><p>Supplier: ${purchase.supplier?.name || '-'}</p><table border="1" cellpadding="6" cellspacing="0"><thead><tr><th>Product</th><th>Qty</th><th>Cost</th><th>GST</th><th>Total</th></tr></thead><tbody>${rows}</tbody></table><h3>Total: ${Number(purchase.total || 0).toFixed(2)}</h3></body></html>`);
    printWindow.document.close();
    printWindow.print();
  }

  return (
    <div>
      <PageHeader title="Purchases" description="Record supplier invoices with a billing-style workflow, live totals, and inventory updates." />

      <div className="grid gap-5 2xl:grid-cols-[1.4fr_320px]">
        <div className="space-y-5">
          <form className="panel space-y-4 p-5" onSubmit={savePurchase}>
            <div className="grid gap-3 lg:grid-cols-[1.1fr_1fr_0.8fr]">
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Supplier</label>
                <select className="input" value={form.supplier} onChange={(event) => setForm((current) => ({ ...current, supplier: event.target.value }))}>
                  <option value="">Select supplier</option>
                  {suppliers.map((supplier) => <option key={supplier._id} value={supplier._id}>{supplier.name}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Supplier Invoice No</label>
                <input className="input" placeholder="Invoice number" value={form.invoiceNumber} onChange={(event) => setForm((current) => ({ ...current, invoiceNumber: event.target.value }))} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Purchase Date</label>
                <input className="input" type="date" value={form.purchaseDate} onChange={(event) => setForm((current) => ({ ...current, purchaseDate: event.target.value }))} />
              </div>
            </div>

            <div className="scroll-panel">
              <div className="table-shell">
                <table className="w-full table-sticky">
                  <thead>
                    <tr><th className="table-th">PID</th><th className="table-th">Product</th><th className="table-th">Qty</th><th className="table-th">Unit</th><th className="table-th">Cost</th><th className="table-th">GST%</th><th className="table-th">MRP</th><th className="table-th">Selling</th><th className="table-th">Total</th><th className="table-th"></th></tr>
                  </thead>
                  <tbody>
                    {form.rows.map((row, index) => {
                      const lineTotal = Number(row.quantity || 0) * Number(row.costPrice || 0) * (1 + Number(row.gstRate || 0) / 100);
                      return (
                        <tr key={index}>
                          <td className="table-td min-w-[70px]">{index + 1}</td>
                          <td className="table-td min-w-[220px]">
                            <select className="input" value={row.product || (row.name ? '__new__' : '')} onChange={(event) => selectProduct(index, event.target.value)}>
                              <option value="">Select product</option>
                              <option value="__new__">Create new product</option>
                              {products.map((product) => <option key={product._id} value={product._id}>{product.name}</option>)}
                            </select>
                            {!row.product ? <input className="input mt-2" placeholder="New product name" value={row.name} onChange={(event) => updateRow(index, { name: event.target.value })} /> : null}
                          </td>
                          <td className="table-td min-w-[90px]"><input className="input" type="number" step="0.001" value={row.quantity} onChange={(event) => updateRow(index, { quantity: event.target.value })} /></td>
                          <td className="table-td min-w-[90px]">
                            <select className="input" value={row.unit} onChange={(event) => updateRow(index, { unit: event.target.value })}>
                              {units.map((unit) => <option key={unit._id} value={unit.name}>{unit.name}</option>)}
                            </select>
                          </td>
                          <td className="table-td min-w-[110px]"><input className="input" type="number" step="0.01" value={row.costPrice} onChange={(event) => updateRow(index, { costPrice: event.target.value })} /></td>
                          <td className="table-td min-w-[90px]"><input className="input" type="number" step="0.01" value={row.gstRate} onChange={(event) => updateRow(index, { gstRate: event.target.value })} /></td>
                          <td className="table-td min-w-[110px]"><input className="input" type="number" step="0.01" value={row.mrp} onChange={(event) => updateRow(index, { mrp: event.target.value })} /></td>
                          <td className="table-td min-w-[110px]"><input className="input" type="number" step="0.01" value={row.sellingPrice} onChange={(event) => updateRow(index, { sellingPrice: event.target.value })} /></td>
                          <td className="table-td min-w-[110px] font-semibold">{currency(lineTotal)}</td>
                          <td className="table-td">
                            <button type="button" className="flex h-9 w-9 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 hover:border-red-300 transition" onClick={() => setForm((current) => {
                              const rows = current.rows.filter((_, rowIndex) => rowIndex !== index);
                              return { ...current, rows: rows.length ? rows : [{ ...blankRow }] };
                            })}>
                              <Trash2 size={15} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4 dark:border-slate-800">
              <button type="button" className="btn-muted" onClick={addRow}><Plus size={16} />Add Row</button>
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm text-slate-500">{summary.totalItems} items • {summary.totalQty} qty</span>
                <span className="text-lg font-bold">{currency(summary.grandTotal)}</span>
                <button type="button" className="btn-muted" onClick={clearForm}>Clear</button>
                <button className="btn-primary">{editing ? 'Update Purchase' : 'Save Purchase'}</button>
              </div>
            </div>
          </form>

          <div className="scroll-panel">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-800">
              <div>
                <h2 className="font-semibold">Purchase History</h2>
                <p className="text-sm text-slate-500">Recent supplier invoices and stock-in records.</p>
              </div>
            </div>
            <div className="table-shell">
              <table className="w-full table-sticky">
                <thead>
                  <tr><th className="table-th">Purchase No</th><th className="table-th">Supplier</th><th className="table-th">Invoice</th><th className="table-th">Date</th><th className="table-th">Items</th><th className="table-th">Total</th><th className="table-th">Status</th><th className="table-th"></th></tr>
                </thead>
                <tbody>
                  {purchases.map((purchase) => (
                    <tr key={purchase._id}>
                      <td className="table-td">{purchase._id.slice(-6).toUpperCase()}</td>
                      <td className="table-td">{purchase.supplier?.name || '-'}</td>
                      <td className="table-td">{purchase.invoiceNumber || '-'}</td>
                      <td className="table-td">{dateTime(purchase.purchaseDate || purchase.createdAt)}</td>
                      <td className="table-td">{purchase.items?.length || 0}</td>
                      <td className="table-td font-semibold">{currency(purchase.total || 0)}</td>
                      <td className="table-td">{purchase.active === false ? 'Deleted' : 'Active'}</td>
                      <td className="table-td text-right">
                        <div className="flex justify-end gap-2">
                          <button className="btn-muted py-1.5" onClick={() => viewPurchase(purchase)}>View</button>
                          <button className="btn-muted h-9 w-9 p-0" onClick={() => editPurchase(purchase)} title="Edit"><Edit2 size={15} /></button>
                          <button className="btn-muted h-9 w-9 p-0" onClick={() => printPurchase(purchase)} title="Print"><Printer size={15} /></button>
                          <button className="btn-muted h-9 w-9 p-0" onClick={() => deletePurchase(purchase)} title="Delete"><Trash2 size={15} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="space-y-5">
          <div className="panel p-5">
            <h2 className="font-semibold">Purchase Summary</h2>
            <div className="mt-4 space-y-3 text-sm">
              <div className="flex items-center justify-between"><span className="text-slate-500">Total items</span><strong>{summary.totalItems}</strong></div>
              <div className="flex items-center justify-between"><span className="text-slate-500">Total quantity</span><strong>{summary.totalQty}</strong></div>
              <div className="flex items-center justify-between"><span className="text-slate-500">Subtotal</span><strong>{currency(summary.subtotal)}</strong></div>
              <div className="flex items-center justify-between"><span className="text-slate-500">GST total</span><strong>{currency(summary.gstTotal)}</strong></div>
              <div className="flex items-center justify-between"><span className="text-slate-500">Grand total</span><strong>{currency(summary.grandTotal)}</strong></div>
            </div>
          </div>

          <div className="panel p-5">
            <h2 className="font-semibold">Supplier Details</h2>
            {supplierDetails ? (
              <div className="mt-4 space-y-3 text-sm">
                <div><span className="text-slate-500">Supplier Name</span><p className="font-semibold">{supplierDetails.name}</p></div>
                <div><span className="text-slate-500">Mobile</span><p>{supplierDetails.mobile || '-'}</p></div>
                <div><span className="text-slate-500">GST Number</span><p>{supplierDetails.gstNumber || '-'}</p></div>
                <div><span className="text-slate-500">Address</span><p>{supplierDetails.address || '-'}</p></div>
              </div>
            ) : (
              <p className="mt-4 text-sm text-slate-500">Select a supplier to load its profile and purchase context.</p>
            )}
          </div>
        </div>
      </div>

      {viewing ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="panel max-h-[90vh] w-full max-w-3xl overflow-y-auto p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Purchase {viewing.invoiceNumber || viewing._id}</h2>
              <button className="btn-muted" onClick={() => setViewing(null)}>Close</button>
            </div>
            <div className="mt-3 text-sm text-slate-500">{viewing.supplier?.name || '-'} | {dateTime(viewing.purchaseDate || viewing.createdAt)}</div>
            <table className="mt-4 w-full">
              <thead><tr><th className="table-th">Product</th><th className="table-th">Qty</th><th className="table-th">Cost</th><th className="table-th">GST</th><th className="table-th">Total</th></tr></thead>
              <tbody>{viewing.items?.map((item, index) => <tr key={index}><td className="table-td">{item.name}</td><td className="table-td">{item.quantity} {item.unit}</td><td className="table-td">{currency(item.costPrice)}</td><td className="table-td">{item.gstRate || 0}%</td><td className="table-td">{currency(item.lineTotal)}</td></tr>)}</tbody>
            </table>
            <div className="mt-4 flex justify-end gap-2"><button className="btn-muted" onClick={() => printPurchase()}><Printer size={16} />Print</button><strong className="px-3 py-2">{currency(viewing.total || 0)}</strong></div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
