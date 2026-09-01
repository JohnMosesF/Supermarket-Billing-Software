import { Download, RefreshCw, Search, Settings, Upload } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { api } from '../api/http.js';
import { PageHeader } from '../components/PageHeader.jsx';
import { currency, dateTime } from '../utils/format.js';

const tabs = [
  ['adjustment', 'Stock Adjustment'],
  ['history', 'Stock History'],
  ['bulk', 'Bulk Update'],
  ['excel', 'Excel'],
  ['settings', 'Settings']
];

const adjustmentTypes = ['Increase', 'Decrease', 'Damage', 'Expired', 'Lost', 'Opening Correction'];

export function Inventory() {
  const [activeTab, setActiveTab] = useState('adjustment');
  const [logs, setLogs] = useState([]);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [brands, setBrands] = useState([]);
  const [units, setUnits] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [search, setSearch] = useState('');
  const [importSummary, setImportSummary] = useState(null);
  const [settings, setSettings] = useState(null);
  const { register, handleSubmit, reset, watch } = useForm({ defaultValues: { adjustmentType: 'Increase' } });
  const bulkForm = useForm();

  async function load() {
    const [logRes, productRes, categoryRes, brandRes, unitRes, settingsRes] = await Promise.all([
      api.get('/inventory/logs'),
      api.get('/products', { params: { limit: 10000 } }),
      api.get('/categories', { silent: true }).catch(() => ({ data: { categories: [] } })),
      api.get('/brands', { silent: true }).catch(() => ({ data: { brands: [] } })),
      api.get('/units', { silent: true }).catch(() => ({ data: { units: [] } })),
      api.get('/inventory/settings', { silent: true }).catch(() => ({ data: { settings: null } }))
    ]);
    setLogs(logRes.data.logs || []);
    setProducts(productRes.data.products || []);
    setCategories(categoryRes.data.categories || []);
    setBrands(brandRes.data.brands || []);
    setUnits(unitRes.data.units || []);
    setSettings(settingsRes.data.settings);
  }

  useEffect(() => { load().catch(() => toast.error('Failed to load inventory')); }, []);

  const filteredProducts = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return products;
    return products.filter((product) => [product.name, product.sku, product.barcode, product.productId].some((value) => String(value || '').toLowerCase().includes(term)));
  }, [products, search]);

  const selectedProduct = products.find((product) => product._id === watch('product'));

  async function adjust(values) {
    await api.post('/inventory/adjust', {
      product: values.product,
      adjustmentType: values.adjustmentType,
      adjustedQuantity: Number(values.adjustedQuantity || 0),
      reason: values.reason,
      remarks: values.remarks,
      date: values.date || undefined
    });
    toast.success('Stock adjustment saved');
    reset({ adjustmentType: 'Increase' });
    await load();
  }

  async function applyBulk(values) {
    await api.post('/inventory/bulk-update', {
      productIds: selectedIds,
      purchasePrice: values.purchasePrice,
      sellingPrice: values.sellingPrice,
      retailPrice: values.retailPrice,
      mrp: values.mrp,
      wholesalePrice: values.wholesalePrice,
      taxRate: values.taxRate,
      category: values.category,
      brand: values.brand,
      unit: values.unit
    });
    toast.success('Bulk update completed');
    bulkForm.reset();
    setSelectedIds([]);
    await load();
  }

  async function importExcel(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const data = new FormData();
    data.append('file', file);
    const res = await api.post('/inventory/products/import', data, { headers: { 'Content-Type': 'multipart/form-data' } });
    setImportSummary(res.data.summary);
    toast.success('Import completed');
    await load();
    event.target.value = '';
  }

  async function saveSettings(event) {
    event.preventDefault();
    const res = await api.put('/inventory/settings', settings);
    setSettings(res.data.settings);
    toast.success('Inventory settings saved');
  }

  async function exportUrl(path, fallbackName) {
    const response = await api.get(path, { responseType: 'blob' });
    const url = URL.createObjectURL(response.data);
    const link = document.createElement('a');
    link.href = url;
    link.download = fallbackName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function toggleProduct(id) {
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  return (
    <div>
      <PageHeader title="Inventory" description="Manage stock adjustments, movement history, bulk product updates, Excel import/export, and inventory settings." actions={<button className="btn-muted" onClick={load}><RefreshCw size={16} /> Refresh</button>} />

      <div className="mb-5 flex flex-wrap gap-2">
        {tabs.map(([key, label]) => (
          <button key={key} className={activeTab === key ? 'btn-primary' : 'btn-muted'} onClick={() => setActiveTab(key)}>
            {key === 'settings' ? <Settings size={16} /> : <RefreshCw size={16} />}{label}
          </button>
        ))}
      </div>

      {activeTab === 'adjustment' ? (
        <div className="grid gap-5 xl:grid-cols-[380px_1fr]">
          <form className="panel space-y-3 p-5" onSubmit={handleSubmit(adjust)}>
            <h2 className="font-semibold">Stock Adjustment</h2>
            <select className="input" {...register('product', { required: true })}>
              <option value="">Select product</option>
              {products.map((product) => <option key={product._id} value={product._id}>{product.name} ({product.stock} {product.unit})</option>)}
            </select>
            <input className="input" value={selectedProduct ? `Current stock: ${selectedProduct.stock} ${selectedProduct.unit || ''}` : ''} readOnly placeholder="Current stock" />
            <select className="input" {...register('adjustmentType', { required: true })}>
              {adjustmentTypes.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
            <input className="input" type="number" min="0.001" step="0.001" placeholder="Adjusted quantity" {...register('adjustedQuantity', { required: true })} />
            <input className="input" placeholder="Reason" {...register('reason', { required: true })} />
            <input className="input" placeholder="Remarks" {...register('remarks')} />
            <input className="input" type="date" {...register('date')} />
            <button className="btn-primary w-full"><RefreshCw size={17} />Apply Adjustment</button>
          </form>

          <MovementTable logs={logs.slice(0, 80)} />
        </div>
      ) : null}

      {activeTab === 'history' ? <MovementTable logs={logs} /> : null}

      {activeTab === 'bulk' ? (
        <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
          <div className="scroll-panel">
            <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
              <Search size={16} className="text-slate-400" />
              <input className="input" placeholder="Search products by name, SKU, barcode, or PID" value={search} onChange={(event) => setSearch(event.target.value)} />
            </div>
            <div className="table-shell">
              <table className="w-full table-sticky">
                <thead><tr><th className="table-th"></th><th className="table-th">Product</th><th className="table-th">SKU</th><th className="table-th">Barcode</th><th className="table-th">Stock</th><th className="table-th">GST</th></tr></thead>
                <tbody>{filteredProducts.map((product) => <tr key={product._id}><td className="table-td"><input type="checkbox" checked={selectedIds.includes(product._id)} onChange={() => toggleProduct(product._id)} /></td><td className="table-td font-semibold">{product.name}</td><td className="table-td">{product.sku}</td><td className="table-td">{product.barcode || '-'}</td><td className="table-td">{product.stock} {product.unit}</td><td className="table-td">{product.taxRate || 0}%</td></tr>)}</tbody>
              </table>
            </div>
          </div>
          <form className="panel space-y-3 p-5" onSubmit={bulkForm.handleSubmit(applyBulk)}>
            <h2 className="font-semibold">Bulk Update ({selectedIds.length})</h2>
            <input className="input" type="number" step="0.01" placeholder="Purchase price" {...bulkForm.register('purchasePrice')} />
            <input className="input" type="number" step="0.01" placeholder="Retail / selling price" {...bulkForm.register('sellingPrice')} />
            <input className="input" type="number" step="0.01" placeholder="MRP" {...bulkForm.register('mrp')} />
            <input className="input" type="number" step="0.01" placeholder="Wholesale price" {...bulkForm.register('wholesalePrice')} />
            <input className="input" type="number" step="0.01" placeholder="GST %" {...bulkForm.register('taxRate')} />
            <select className="input" {...bulkForm.register('category')}><option value="">Category unchanged</option>{categories.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}</select>
            <select className="input" {...bulkForm.register('brand')}><option value="">Brand unchanged</option>{brands.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}</select>
            <select className="input" {...bulkForm.register('unit')}><option value="">Unit unchanged</option>{units.map((item) => <option key={item._id} value={item.name}>{item.name}</option>)}</select>
            <button className="btn-primary w-full" disabled={!selectedIds.length}>Apply Bulk Update</button>
          </form>
        </div>
      ) : null}

      {activeTab === 'excel' ? (
        <div className="panel space-y-4 p-5">
          <div className="flex flex-wrap gap-2">
            <button className="btn-muted" onClick={() => exportUrl('/inventory/products/template', 'product-import-template.xlsx')}><Download size={16} />Download Template</button>
            <label className="btn-primary cursor-pointer"><Upload size={16} />Import Excel<input type="file" accept=".xlsx" className="hidden" onChange={importExcel} /></label>
            <button className="btn-muted" onClick={() => exportUrl('/inventory/products/export', 'products.xlsx')}><Download size={16} />Export Products</button>
            <button className="btn-muted" onClick={() => exportUrl('/inventory/stock/export', 'stock.xlsx')}><Download size={16} />Export Stock</button>
            <button className="btn-muted" onClick={() => exportUrl('/inventory/purchases/export', 'purchases.xlsx')}><Download size={16} />Export Purchase</button>
          </div>
          {importSummary ? <div className="rounded-md border border-slate-200 p-3 text-sm dark:border-slate-800">Imported <b>{importSummary.imported}</b>, skipped <b>{importSummary.skipped}</b>{importSummary.invalidRows?.length ? <div className="mt-2 text-red-600">{importSummary.invalidRows.slice(0, 8).map((row) => <p key={row.row}>Row {row.row}: {row.reason}</p>)}</div> : null}</div> : null}
        </div>
      ) : null}

      {activeTab === 'settings' && settings ? (
        <form className="panel grid gap-3 p-5 md:grid-cols-3" onSubmit={saveSettings}>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(settings.allowNegativeStock)} onChange={(event) => setSettings({ ...settings, allowNegativeStock: event.target.checked })} />Allow Negative Stock</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(settings.autoUpdateSellingPrice)} onChange={(event) => setSettings({ ...settings, autoUpdateSellingPrice: event.target.checked })} />Auto Update Selling Price</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(settings.autoGeneratePurchaseNumber)} onChange={(event) => setSettings({ ...settings, autoGeneratePurchaseNumber: event.target.checked })} />Auto Generate Purchase Number</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(settings.defaultRoundOff)} onChange={(event) => setSettings({ ...settings, defaultRoundOff: event.target.checked })} />Default Round Off</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(settings.preventDuplicateSupplierInvoice)} onChange={(event) => setSettings({ ...settings, preventDuplicateSupplierInvoice: event.target.checked })} />Prevent Duplicate Supplier Invoice</label>
          <input className="input" placeholder="Purchase prefix" value={settings.purchaseNumberPrefix || ''} onChange={(event) => setSettings({ ...settings, purchaseNumberPrefix: event.target.value })} />
          <input className="input" type="number" min="0" max="100" step="0.01" placeholder="Default GST" value={settings.defaultGST || 0} onChange={(event) => setSettings({ ...settings, defaultGST: Number(event.target.value) })} />
          <input className="input" type="number" min="0" max="100" step="0.01" placeholder="Default purchase discount" value={settings.defaultPurchaseDiscount || 0} onChange={(event) => setSettings({ ...settings, defaultPurchaseDiscount: Number(event.target.value) })} />
          <button className="btn-primary md:col-span-3">Save Settings</button>
        </form>
      ) : null}
    </div>
  );
}

function MovementTable({ logs }) {
  return (
    <div className="scroll-panel">
      <div className="border-b border-slate-100 px-4 py-3 dark:border-slate-800">
        <h2 className="font-semibold">Stock Movement History</h2>
        <p className="text-sm text-slate-500">Every stock change is recorded with opening and closing stock.</p>
      </div>
      <div className="table-shell">
        <table className="w-full table-sticky">
          <thead><tr><th className="table-th">Date</th><th className="table-th">Product</th><th className="table-th">Reference</th><th className="table-th">In</th><th className="table-th">Out</th><th className="table-th">Stock</th><th className="table-th">User</th></tr></thead>
          <tbody>{logs.map((log) => <tr key={log._id}><td className="table-td">{dateTime(log.createdAt)}</td><td className="table-td"><strong>{log.product?.name}</strong><p className="text-xs text-slate-500">{log.product?.sku}</p></td><td className="table-td">{log.referenceType || log.source}<p className="text-xs text-slate-500">{log.referenceNumber || log.reason}</p></td><td className="table-td">{log.quantityIn || (log.type === 'stock_in' ? log.quantity : 0)}</td><td className="table-td">{log.quantityOut || (log.type === 'stock_out' ? log.quantity : 0)}</td><td className="table-td">{log.openingStock ?? log.stockBefore} to {log.closingStock ?? log.stockAfter}</td><td className="table-td">{log.user?.name || '-'}</td></tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}
