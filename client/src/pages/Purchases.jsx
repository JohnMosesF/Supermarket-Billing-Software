import { CheckCircle2, FileText, Plus, Printer, Search, Trash2, XCircle } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { api } from '../api/http.js';
import { PageHeader } from '../components/PageHeader.jsx';
import { currency, dateTime } from '../utils/format.js';

const blankRow = {
  product: '',
  quantity: 1,
  unit: 'pcs',
  costPrice: 0,
  gstRate: 0,
  mrp: 0,
  sellingPrice: 0
};

const statusLabels = {
  draft: 'Draft',
  pending: 'Pending',
  partially_received: 'Partially Received',
  completed: 'Completed',
  cancelled: 'Cancelled'
};

function lineTotal(row) {
  const quantity = Number(row.quantity || 0);
  const costPrice = Number(row.costPrice || 0);
  const gstRate = Number(row.gstRate || 0);
  return quantity * costPrice * (1 + gstRate / 100);
}

function PrintButton({ onClick, title = 'Print' }) {
  return (
    <button type="button" className="btn-muted h-9 w-9 p-0" onClick={onClick} title={title}>
      <Printer size={15} />
    </button>
  );
}

export function Purchases() {
  const [activeTab, setActiveTab] = useState('purchase');
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [units, setUnits] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [priceContext, setPriceContext] = useState({});
  const [poSearch, setPoSearch] = useState('');
  const [poStatus, setPoStatus] = useState('');
  const [purchaseForm, setPurchaseForm] = useState({
    supplier: '',
    invoiceNumber: '',
    purchaseDate: new Date().toISOString().slice(0, 10),
    paidAmount: 0,
    rows: [{ ...blankRow }]
  });
  const [poForm, setPoForm] = useState({
    supplier: '',
    expectedDate: '',
    status: 'draft',
    notes: '',
    rows: [{ ...blankRow }]
  });

  async function load() {
    const [supplierRes, productRes, unitRes, purchaseRes, poRes] = await Promise.all([
      api.get('/suppliers', { params: { limit: 1000 } }),
      api.get('/products', { params: { limit: 10000 } }),
      api.get('/units'),
      api.get('/purchases'),
      api.get('/purchase-orders')
    ]);
    setSuppliers(supplierRes.data.suppliers || []);
    setProducts(productRes.data.products || []);
    setUnits(unitRes.data.units || []);
    setPurchases(purchaseRes.data.purchases || []);
    setPurchaseOrders(poRes.data.purchaseOrders || []);
  }

  useEffect(() => {
    load().catch(() => toast.error('Failed to load purchases'));
  }, []);

  async function loadPurchaseOrders() {
    const { data } = await api.get('/purchase-orders', { params: { search: poSearch || undefined, status: poStatus || undefined } });
    setPurchaseOrders(data.purchaseOrders || []);
  }

  function updateRow(index, patch) {
    setForm((current) => ({
      ...current,
      rows: current.rows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row))
    }));
  }

  function applyProduct(row, productId) {
    if (productId === '__new__') {
      updateRow(index, { product: '', name: '', costPrice: 0, gstRate: 0, mrp: 0, sellingPrice: 0 });
      return;
    }

    const product = products.find((item) => item._id === productId);
    return {
      ...row,
      product: productId,
      unit: product?.unit || 'pcs',
      costPrice: product?.purchasePrice || 0,
      gstRate: product?.taxRate || 0,
      mrp: product?.mrp || 0,
      sellingPrice: product?.sellingPrice || 0
    };
  }

  async function selectPurchaseProduct(index, productId) {
    setPurchaseForm((current) => ({
      ...current,
      rows: current.rows.map((row, rowIndex) => rowIndex === index ? applyProduct(row, productId) : row)
    }));
    if (!productId) return;
    const { data } = await api.get('/purchases/price-history', { params: { product: productId } });
    setPriceContext((current) => ({ ...current, [productId]: data }));
  }

  function selectPoProduct(index, productId) {
    setPoForm((current) => ({
      ...current,
      rows: current.rows.map((row, rowIndex) => rowIndex === index ? applyProduct(row, productId) : row)
    }));
  }

  function updatePurchaseRow(index, patch) {
    setPurchaseForm((current) => ({
      ...current,
      rows: current.rows.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row)
    }));
  }

  function updatePoRow(index, patch) {
    setPoForm((current) => ({
      ...current,
      rows: current.rows.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row)
    }));
  }

  function removeRow(setter, index) {
    setter((current) => {
      const rows = current.rows.filter((_, rowIndex) => rowIndex !== index);
      return { ...current, rows: rows.length ? rows : [{ ...blankRow }] };
    });
  }

  const purchaseSummary = useMemo(() => {
    const total = purchaseForm.rows.reduce((sum, row) => sum + lineTotal(row), 0);
    return {
      quantity: purchaseForm.rows.reduce((sum, row) => sum + Number(row.quantity || 0), 0),
      total
    };
  }, [purchaseForm.rows]);
  const purchaseOutstanding = Math.max(Number(purchaseSummary.total || 0) - Number(purchaseForm.paidAmount || 0), 0);

  const poSummary = useMemo(() => ({
    quantity: poForm.rows.reduce((sum, row) => sum + Number(row.quantity || 0), 0),
    total: poForm.rows.reduce((sum, row) => sum + lineTotal(row), 0)
  }), [poForm.rows]);

  function itemPayload(rows) {
    return rows.map((row) => ({
      product: row.product,
      quantity: Number(row.quantity || 0),
      unit: row.unit || 'pcs',
      costPrice: Number(row.costPrice || 0),
      gstRate: Number(row.gstRate || 0),
      mrp: Number(row.mrp || 0),
      sellingPrice: Number(row.sellingPrice || 0)
    }));
  }

  async function savePurchase(event) {
    event.preventDefault();
    await api.post('/purchases', {
      supplier: purchaseForm.supplier || undefined,
      invoiceNumber: purchaseForm.invoiceNumber,
      purchaseDate: purchaseForm.purchaseDate,
      paidAmount: Math.min(Number(purchaseForm.paidAmount || 0), purchaseSummary.total),
      items: itemPayload(purchaseForm.rows)
    });
    toast.success('Purchase saved and stock updated');
    setPurchaseForm({ supplier: '', invoiceNumber: '', purchaseDate: new Date().toISOString().slice(0, 10), paidAmount: 0, rows: [{ ...blankRow }] });
    await load();
  }

  async function savePurchaseOrder(event) {
    event.preventDefault();
    await api.post('/purchase-orders', {
      supplier: poForm.supplier,
      expectedDate: poForm.expectedDate || undefined,
      status: poForm.status,
      notes: poForm.notes,
      items: itemPayload(poForm.rows)
    });
    toast.success('Purchase order saved');
    setPoForm({ supplier: '', expectedDate: '', status: 'draft', notes: '', rows: [{ ...blankRow }] });
    await loadPurchaseOrders();
  }

  async function receiveGoods(order) {
    const items = (order.items || [])
      .map((item) => {
        const pending = Number(item.quantity || 0) - Number(item.receivedQuantity || 0);
        return pending > 0 ? { product: item.product?._id || item.product, receivedQuantity: pending } : null;
      })
      .filter(Boolean);
    if (!items.length) return toast.error('No pending quantity to receive');
    await api.post(`/purchase-orders/${order._id}/receive`, { items });
    toast.success('Goods received');
    await loadPurchaseOrders();
  }

  async function convertOrder(order) {
    const invoiceNumber = window.prompt('Supplier invoice number', order.poNumber);
    if (invoiceNumber === null) return;
    await api.post(`/purchase-orders/${order._id}/convert`, { invoiceNumber });
    toast.success('Converted to purchase and stock updated');
    await load();
  }

  async function cancelOrder(order) {
    if (!window.confirm(`Cancel ${order.poNumber}?`)) return;
    await api.post(`/purchase-orders/${order._id}/cancel`, {});
    toast.success('Purchase order cancelled');
    await loadPurchaseOrders();
  }

  function printPurchaseOrder(order) {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    const rows = (order.items || []).map((item) => `<tr><td>${item.name}</td><td>${item.quantity} ${item.unit || ''}</td><td>${Number(item.receivedQuantity || 0)}</td><td>${Number(item.costPrice || 0).toFixed(2)}</td><td>${Number(item.lineTotal || 0).toFixed(2)}</td></tr>`).join('');
    printWindow.document.write(`<html><body><h2>Purchase Order ${order.poNumber}</h2><p>Supplier: ${order.supplier?.name || '-'}</p><p>Status: ${statusLabels[order.status] || order.status}</p><table border="1" cellpadding="6" cellspacing="0"><thead><tr><th>Product</th><th>Ordered</th><th>Received</th><th>Price</th><th>Total</th></tr></thead><tbody>${rows}</tbody></table><h3>Total: ${Number(order.total || 0).toFixed(2)}</h3></body></html>`);
    printWindow.document.close();
    printWindow.print();
  }

  function renderRows(rows, onProduct, onUpdate, onRemove) {
    return rows.map((row, index) => {
      const context = row.product ? priceContext[row.product] : null;
      return (
        <tr key={index}>
          <td className="table-td min-w-[220px]">
            <select className="input" value={row.product} onChange={(event) => onProduct(index, event.target.value)} required>
              <option value="">Select product</option>
              {products.map((product) => <option key={product._id} value={product._id}>{product.name}</option>)}
            </select>
            {context ? (
              <div className="mt-2 rounded-md border border-slate-200 bg-slate-50 p-2 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                <div>Previous: {currency(context.lastPurchasePrice || 0)} from {context.lastSupplier?.name || '-'}</div>
                <div>Average: {currency(context.averagePurchasePrice || 0)}</div>
              </div>
            ) : null}
          </td>
          <td className="table-td min-w-[90px]"><input className="input" type="number" step="0.001" min="0.001" value={row.quantity} onChange={(event) => onUpdate(index, { quantity: event.target.value })} /></td>
          <td className="table-td min-w-[90px]">
            <select className="input" value={row.unit} onChange={(event) => onUpdate(index, { unit: event.target.value })}>
              {units.map((unit) => <option key={unit._id} value={unit.name}>{unit.name}</option>)}
            </select>
          </td>
          <td className="table-td min-w-[110px]"><input className="input" type="number" step="0.01" min="0" value={row.costPrice} onChange={(event) => onUpdate(index, { costPrice: event.target.value })} /></td>
          <td className="table-td min-w-[90px]"><input className="input" type="number" step="0.01" min="0" value={row.gstRate} onChange={(event) => onUpdate(index, { gstRate: event.target.value })} /></td>
          <td className="table-td min-w-[110px]"><input className="input" type="number" step="0.01" min="0" value={row.mrp} onChange={(event) => onUpdate(index, { mrp: event.target.value })} /></td>
          <td className="table-td min-w-[110px]"><input className="input" type="number" step="0.01" min="0" value={row.sellingPrice} onChange={(event) => onUpdate(index, { sellingPrice: event.target.value })} /></td>
          <td className="table-td min-w-[110px] font-semibold">{currency(lineTotal(row))}</td>
          <td className="table-td">
            <button type="button" className="btn-muted h-9 w-9 p-0 text-red-600" onClick={() => onRemove(index)}><Trash2 size={15} /></button>
          </td>
        </tr>
      );
    });
  }

  return (
    <div>
      <PageHeader title="Purchases" description="Create supplier purchases, track supplier price history, and manage purchase orders." />

      <div className="mb-5 flex flex-wrap gap-2">
        <button className={activeTab === 'purchase' ? 'btn-primary' : 'btn-muted'} onClick={() => setActiveTab('purchase')}><FileText size={16} />Purchase Entry</button>
        <button className={activeTab === 'orders' ? 'btn-primary' : 'btn-muted'} onClick={() => setActiveTab('orders')}><CheckCircle2 size={16} />Purchase Orders</button>
      </div>

      {activeTab === 'purchase' ? (
        <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
          <form className="panel space-y-4 p-5" onSubmit={savePurchase}>
            <div className="grid gap-3 md:grid-cols-4">
              <select className="input" value={purchaseForm.supplier} onChange={(event) => setPurchaseForm((current) => ({ ...current, supplier: event.target.value }))}>
                <option value="">Select supplier</option>
                {suppliers.map((supplier) => <option key={supplier._id} value={supplier._id}>{supplier.name}</option>)}
              </select>
              <input className="input" placeholder="Invoice number" value={purchaseForm.invoiceNumber} onChange={(event) => setPurchaseForm((current) => ({ ...current, invoiceNumber: event.target.value }))} />
              <input className="input" type="date" value={purchaseForm.purchaseDate} onChange={(event) => setPurchaseForm((current) => ({ ...current, purchaseDate: event.target.value }))} />
              <input className="input" type="number" min="0" step="0.01" placeholder="Amount paid" value={purchaseForm.paidAmount} onChange={(event) => setPurchaseForm((current) => ({ ...current, paidAmount: event.target.value }))} />
            </div>

            <div className="table-shell">
              <table className="w-full">
                <thead><tr><th className="table-th">Product</th><th className="table-th">Qty</th><th className="table-th">Unit</th><th className="table-th">Cost</th><th className="table-th">GST</th><th className="table-th">MRP</th><th className="table-th">Selling</th><th className="table-th">Total</th><th className="table-th"></th></tr></thead>
                <tbody>{renderRows(purchaseForm.rows, selectPurchaseProduct, updatePurchaseRow, (index) => removeRow(setPurchaseForm, index))}</tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4 dark:border-slate-800">
              <button type="button" className="btn-muted" onClick={() => setPurchaseForm((current) => ({ ...current, rows: [...current.rows, { ...blankRow }] }))}><Plus size={16} />Add Row</button>
              <div className="flex items-center gap-3">
                <span className="text-sm text-slate-500">{purchaseSummary.quantity} qty</span>
                <strong className="text-lg">{currency(purchaseSummary.total)}</strong>
                <span className="rounded-md bg-orange-50 px-3 py-2 text-sm font-semibold text-orange-700">Outstanding {currency(purchaseOutstanding)}</span>
                <button className="btn-primary">Save Purchase</button>
              </div>
            </div>
          </form>

          <div className="panel p-5">
            <h2 className="font-semibold">Purchase History</h2>
            <div className="mt-4 max-h-[560px] space-y-3 overflow-y-auto">
              {purchases.map((purchase) => (
                <div key={purchase._id} className="rounded-md border border-slate-200 p-3 text-sm dark:border-slate-800">
                  <div className="flex justify-between gap-3"><strong>{purchase.invoiceNumber || purchase._id.slice(-6).toUpperCase()}</strong><span>{currency(purchase.total || 0)}</span></div>
                  <div className="mt-1 text-slate-500">{purchase.supplier?.name || '-'} | {dateTime(purchase.purchaseDate || purchase.createdAt)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          <form className="panel space-y-4 p-5" onSubmit={savePurchaseOrder}>
            <div className="grid gap-3 md:grid-cols-4">
              <select className="input" value={poForm.supplier} onChange={(event) => setPoForm((current) => ({ ...current, supplier: event.target.value }))} required>
                <option value="">Select supplier</option>
                {suppliers.map((supplier) => <option key={supplier._id} value={supplier._id}>{supplier.name}</option>)}
                <option value="__new__">Create new product</option>
                {products.map((product) => <option key={product._id} value={product._id}>{product.name}</option>)}                
              </select>
              {!row.product ? <input className="input mt-2" placeholder="New product name" value={row.name} onChange={(event) => updateRow(index, { name: event.target.value })} /> : null}
              <input className="input" type="date" value={poForm.expectedDate} onChange={(event) => setPoForm((current) => ({ ...current, expectedDate: event.target.value }))} />
              <select className="input" value={poForm.status} onChange={(event) => setPoForm((current) => ({ ...current, status: event.target.value }))}>
                <option value="draft">Draft</option>
                <option value="pending">Pending</option>
              </select>
              <input className="input" placeholder="Notes" value={poForm.notes} onChange={(event) => setPoForm((current) => ({ ...current, notes: event.target.value }))} />
            </div>
            <div className="table-shell">
              <table className="w-full">
                <thead><tr><th className="table-th">Product</th><th className="table-th">Qty</th><th className="table-th">Unit</th><th className="table-th">Cost</th><th className="table-th">GST</th><th className="table-th">MRP</th><th className="table-th">Selling</th><th className="table-th">Total</th><th className="table-th"></th></tr></thead>
                <tbody>{renderRows(poForm.rows, selectPoProduct, updatePoRow, (index) => removeRow(setPoForm, index))}</tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4 dark:border-slate-800">
              <button type="button" className="btn-muted" onClick={() => setPoForm((current) => ({ ...current, rows: [...current.rows, { ...blankRow }] }))}><Plus size={16} />Add Row</button>
              <div className="flex items-center gap-3">
                <span className="text-sm text-slate-500">{poSummary.quantity} qty</span>
                <strong className="text-lg">{currency(poSummary.total)}</strong>
                <button className="btn-primary">Create Purchase Order</button>
              </div>
            </div>
          </form>

          <div className="scroll-panel">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
              <h2 className="font-semibold">Purchase Orders</h2>
              <div className="flex flex-wrap gap-2">
                <select className="input w-44" value={poStatus} onChange={(event) => setPoStatus(event.target.value)}>
                  <option value="">All statuses</option>
                  {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-2.5 text-slate-400" size={16} />
                  <input className="input pl-9" placeholder="Search PO" value={poSearch} onChange={(event) => setPoSearch(event.target.value)} />
                </div>
                <button className="btn-muted" onClick={loadPurchaseOrders}>Search</button>
              </div>
            </div>
            <div className="table-shell">
              <table className="w-full table-sticky">
                <thead><tr><th className="table-th">PO Number</th><th className="table-th">Supplier</th><th className="table-th">Status</th><th className="table-th">Ordered</th><th className="table-th">Received</th><th className="table-th">Total</th><th className="table-th">Date</th><th className="table-th"></th></tr></thead>
                <tbody>
                  {purchaseOrders.map((order) => {
                    const ordered = (order.items || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0);
                    const received = (order.items || []).reduce((sum, item) => sum + Number(item.receivedQuantity || 0), 0);
                    return (
                      <tr key={order._id}>
                        <td className="table-td font-semibold">{order.poNumber}</td>
                        <td className="table-td">{order.supplier?.name || '-'}</td>
                        <td className="table-td">{statusLabels[order.status] || order.status}</td>
                        <td className="table-td">{ordered}</td>
                        <td className="table-td">{received}</td>
                        <td className="table-td font-semibold">{currency(order.total || 0)}</td>
                        <td className="table-td">{dateTime(order.orderDate || order.createdAt)}</td>
                        <td className="table-td">
                          <div className="flex justify-end gap-2">
                            <PrintButton onClick={() => printPurchaseOrder(order)} />
                            <button className="btn-muted py-1.5" disabled={!['pending', 'partially_received'].includes(order.status)} onClick={() => receiveGoods(order)}>Receive</button>
                            <button className="btn-muted py-1.5" disabled={!['pending', 'partially_received'].includes(order.status)} onClick={() => convertOrder(order)}>Convert</button>
                            <button className="btn-muted h-9 w-9 p-0 text-red-600" disabled={['completed', 'cancelled'].includes(order.status)} onClick={() => cancelOrder(order)} title="Cancel"><XCircle size={15} /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
