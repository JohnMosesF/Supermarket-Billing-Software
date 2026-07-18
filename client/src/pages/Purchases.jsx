import { CheckCircle2, Copy, Eye, FileText, Pencil, Plus, Printer, Search, Trash2, XCircle } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { api } from '../api/http.js';
import { ConfirmDialog, TextInputDialog } from '../components/AppDialog.jsx';
import { PageHeader } from '../components/PageHeader.jsx';
import { currency, dateTime } from '../utils/format.js';

const blankRow = {
  pid: '',
  product: '',
  batchNo: '',
  expiryDate: '',
  quantity: 1,
  freeQuantity: 0,
  unit: 'pcs',
  costPrice: 0,
  gstRate: 0,
  gstInclusive: false,
  discountPercent: 0,
  discountAmount: 0,
  mrp: 0,
  wholesalePrice: 0,
  retailPrice: 0,
  sellingPrice: 0
};

const statusLabels = {
  draft: 'Draft',
  pending: 'Pending',
  partially_received: 'Partially Received',
  completed: 'Completed',
  cancelled: 'Cancelled'
};

const blankProductForm = {
  name: '',
  localName: '',
  category: '',
  unit: 'pcs',
  taxRate: 0,
  barcode: '',
  sku: '',
  purchasePrice: 0,
  sellingPrice: 0,
  stock: ''
};

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function moneyRound(value) {
  return Math.round(number(value) * 100) / 100;
}

function hasExplicitDiscountAmount(row) {
  return row.discountAmount !== '' && row.discountAmount !== undefined && row.discountAmount !== null;
}

function calculatePurchaseLine(row) {
  const quantity = Math.max(number(row.quantity), 0);
  const freeQuantity = Math.max(number(row.freeQuantity), 0);
  const costPrice = Math.max(number(row.costPrice), 0);
  const gstRate = Math.max(number(row.gstRate), 0);
  const grossAmount = moneyRound(quantity * costPrice);
  const percentDiscount = grossAmount * Math.max(number(row.discountPercent), 0) / 100;
  const discountAmount = moneyRound(Math.min(
    hasExplicitDiscountAmount(row) ? number(row.discountAmount) : percentDiscount,
    grossAmount
  ));
  const discountedAmount = moneyRound(Math.max(grossAmount - discountAmount, 0));
  const gstInclusive = Boolean(row.gstInclusive);
  const gstAmount = moneyRound(gstInclusive && gstRate > 0
    ? discountedAmount - discountedAmount / (1 + gstRate / 100)
    : discountedAmount * gstRate / 100);
  const taxableAmount = moneyRound(gstInclusive ? discountedAmount - gstAmount : discountedAmount);
  const lineTotal = moneyRound(gstInclusive ? discountedAmount : taxableAmount + gstAmount);
  const cgst = moneyRound(gstAmount / 2);
  const sgst = moneyRound(gstAmount - cgst);

  return {
    quantity,
    freeQuantity,
    costPrice,
    gstRate,
    gstInclusive,
    grossAmount,
    discountAmount,
    taxableAmount,
    gstAmount,
    cgst,
    sgst,
    igst: 0,
    lineTotal,
    netAmount: lineTotal
  };
}

function calculatePurchaseTotals(rows, form = {}) {
  const lines = rows.map(calculatePurchaseLine);
  const lineTotalSum = moneyRound(lines.reduce((sum, line) => sum + line.lineTotal, 0));
  const freightCharges = moneyRound(form.freightCharges || 0);
  const roundOff = moneyRound(form.roundOff || 0);
  const grandTotal = moneyRound(Math.max(lineTotalSum + freightCharges + roundOff, 0));
  const paidAmount = moneyRound(Math.min(number(form.paidAmount), grandTotal));

  return {
    lines,
    items: rows.filter((row) => row.product).length,
    quantity: lines.reduce((sum, line) => sum + line.quantity + line.freeQuantity, 0),
    subTotal: moneyRound(lines.reduce((sum, line) => sum + line.taxableAmount, 0)),
    gstTotal: moneyRound(lines.reduce((sum, line) => sum + line.gstAmount, 0)),
    discount: moneyRound(lines.reduce((sum, line) => sum + line.discountAmount, 0)),
    freightCharges,
    roundOff,
    total: grandTotal,
    balance: moneyRound(Math.max(grandTotal - paidAmount, 0))
  };
}

function lineTotal(row) {
  return calculatePurchaseLine(row).lineTotal;
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
  const [categories, setCategories] = useState([]);
  const [units, setUnits] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [purchaseSearch, setPurchaseSearch] = useState('');
  const [editingPurchase, setEditingPurchase] = useState(null);
  const [viewPurchase, setViewPurchase] = useState(null);
  const [deletePurchaseTarget, setDeletePurchaseTarget] = useState(null);
  const [deletingPurchase, setDeletingPurchase] = useState(false);
  const [priceContext, setPriceContext] = useState({});
  const [poSearch, setPoSearch] = useState('');
  const [poStatus, setPoStatus] = useState('');
  const [newProductTarget, setNewProductTarget] = useState(null);
  const [newProductForm, setNewProductForm] = useState({ ...blankProductForm });
  const [savingProduct, setSavingProduct] = useState(false);
  const [convertTarget, setConvertTarget] = useState(null);
  const [convertInvoiceNumber, setConvertInvoiceNumber] = useState('');
  const [convertError, setConvertError] = useState('');
  const [convertingOrder, setConvertingOrder] = useState(false);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancellingOrder, setCancellingOrder] = useState(false);
  const [purchaseForm, setPurchaseForm] = useState({
    purchaseNo: '',
    supplier: '',
    invoiceNumber: '',
    supplierInvoice: '',
    purchaseDate: new Date().toISOString().slice(0, 10),
    expectedDeliveryDate: '',
    paymentStatus: 'Unpaid',
    remarks: '',
    freightCharges: 0,
    roundOff: 0,
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
    const [supplierRes, productRes, categoryRes, unitRes, purchaseRes, poRes] = await Promise.all([
      api.get('/suppliers', { params: { limit: 1000 } }),
      api.get('/products', { params: { limit: 10000 } }),
      api.get('/categories'),
      api.get('/units'),
      api.get('/purchases'),
      api.get('/purchase-orders')
    ]);
    setSuppliers(supplierRes.data.suppliers || []);
    setProducts(productRes.data.products || []);
    setCategories(categoryRes.data.categories || []);
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

  async function loadPurchases() {
    const { data } = await api.get('/purchases', { params: { search: purchaseSearch || undefined } });
    setPurchases(data.purchases || []);
  }

  function productPatch(product) {
    return {
      pid: product?.productId ? String(product.productId) : '',
      product: product?._id || '',
      unit: product?.unit || 'pcs',
      costPrice: product?.purchasePrice || 0,
      gstRate: product?.taxRate || 0,
      gstInclusive: Boolean(product?.gstInclusive),
      mrp: product?.mrp || 0,
      wholesalePrice: product?.wholesalePrice || 0,
      retailPrice: product?.retailPrice ?? product?.sellingPrice ?? 0,
      sellingPrice: product?.sellingPrice || 0
    };
  }

  function applyProduct(row, productId) {
    const product = products.find((item) => item._id === productId);
    return {
      ...row,
      ...productPatch(product)
    };
  }

  async function selectPurchaseProduct(index, productId) {
    if (productId === '__new__') {
      setNewProductTarget({ form: 'purchase', index });
      setNewProductForm({ ...blankProductForm, unit: units[0]?.name || 'pcs' });
      return;
    }
    setPurchaseForm((current) => ({
      ...current,
      rows: current.rows.map((row, rowIndex) => rowIndex === index ? applyProduct(row, productId) : row)
    }));
    if (!productId) return;
    const { data } = await api.get('/purchases/price-history', { params: { product: productId } });
    setPriceContext((current) => ({ ...current, [productId]: data }));
  }

  function selectPoProduct(index, productId) {
    if (productId === '__new__') {
      setNewProductTarget({ form: 'po', index });
      setNewProductForm({ ...blankProductForm, unit: units[0]?.name || 'pcs' });
      return;
    }
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

  function addPurchaseRow() {
    setPurchaseForm((current) => {
      const nextIndex = current.rows.length;
      setTimeout(() => focusRowField('purchase', nextIndex, 'pid'), 0);
      return { ...current, rows: [...current.rows, { ...blankRow }] };
    });
  }

  function focusRowField(form, index, field) {
    setTimeout(() => {
      document.querySelector(`[data-row-key="${form}-${index}"][data-field="${field}"]`)?.focus();
    }, 0);
  }

  function findProductByPid(pid) {
    const value = String(pid || '').trim();
    if (!value) return null;
    return products.find((product) => String(product.productId || '') === value) || null;
  }

  function handlePidChange(form, index, value, onProduct, onUpdate) {
    const pid = value.replace(/[^0-9]/g, '');
    const product = findProductByPid(pid);
    if (product) {
      onProduct(index, product._id);
    } else {
      onUpdate(index, { pid, product: '' });
    }
  }

  async function handlePidKeyDown(event, form, index, row, onProduct) {
    if (event.key !== 'Enter' && event.key !== 'Tab') return;
    event.preventDefault();
    const pid = String(row.pid || '').trim();
    if (!pid) {
      focusRowField(form, index, 'product');
      return;
    }

    let product = findProductByPid(pid);
    if (!product) {
      try {
        const { data } = await api.get(`/products/id/${encodeURIComponent(pid)}`, { silent: true });
        product = data.product;
        if (product?._id) {
          setProducts((current) => current.some((item) => item._id === product._id) ? current : [product, ...current]);
        }
      } catch {
        product = null;
      }
    }

    if (!product?._id) {
      toast.error('Product ID not found');
      return;
    }

    await onProduct(index, product._id);
    focusRowField(form, index, 'quantity');
  }

  function handleProductKeyDown(event, form, index) {
    if (event.key !== 'Enter' && event.key !== 'Tab') return;
    event.preventDefault();
    focusRowField(form, index, 'quantity');
  }

  function handleEntryKeyDown(event, form, index, nextField) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    focusRowField(form, index, nextField);
  }

  function selectCreatedProduct(product) {
    if (!newProductTarget || !product?._id) return;
    const setter = newProductTarget.form === 'purchase' ? setPurchaseForm : setPoForm;
    setter((current) => ({
      ...current,
      rows: current.rows.map((row, rowIndex) => (
        rowIndex === newProductTarget.index ? { ...row, ...productPatch(product) } : row
      ))
    }));
    if (newProductTarget.form === 'purchase') {
      api.get('/purchases/price-history', { params: { product: product._id }, silent: true })
        .then(({ data }) => setPriceContext((current) => ({ ...current, [product._id]: data })))
        .catch(() => {});
    }
    focusRowField(newProductTarget.form, newProductTarget.index, 'quantity');
  }

  async function saveNewProduct() {
    if (!newProductForm.name.trim()) {
      toast.error('Enter product name');
      return;
    }

    setSavingProduct(true);
    try {
      const payload = {
        name: newProductForm.name.trim(),
        localName: newProductForm.localName.trim(),
        category: newProductForm.category || undefined,
        unit: newProductForm.unit || 'pcs',
        taxRate: Number(newProductForm.taxRate || 0),
        barcode: newProductForm.barcode.trim() || undefined,
        sku: newProductForm.sku.trim() || undefined,
        purchasePrice: Number(newProductForm.purchasePrice || 0),
        sellingPrice: Number(newProductForm.sellingPrice || 0),
        stock: Number(newProductForm.stock || 0),
        openingStock: Number(newProductForm.stock || 0)
      };
      const { data } = await api.post('/products', payload);
      const product = data.product;
      setProducts((current) => [product, ...current.filter((item) => item._id !== product._id)]);
      selectCreatedProduct(product);
      setNewProductTarget(null);
      setNewProductForm({ ...blankProductForm });
      toast.success('Product created');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to create product');
    } finally {
      setSavingProduct(false);
    }
  }

  const purchaseSummary = useMemo(() => calculatePurchaseTotals(purchaseForm.rows, purchaseForm), [purchaseForm]);
  const purchaseOutstanding = purchaseSummary.balance;

  const poSummary = useMemo(() => ({
    quantity: poForm.rows.reduce((sum, row) => sum + Number(row.quantity || 0), 0),
    total: poForm.rows.reduce((sum, row) => sum + lineTotal(row), 0)
  }), [poForm.rows]);

  function itemPayload(rows) {
    return rows.map((row) => {
      const line = calculatePurchaseLine(row);
      return {
      product: row.product,
      quantity: line.quantity,
      unit: row.unit || 'pcs',
      batchNo: row.batchNo || undefined,
      expiryDate: row.expiryDate || undefined,
      costPrice: line.costPrice,
      purchasePrice: line.costPrice,
      freeQuantity: line.freeQuantity,
      gstRate: line.gstRate,
      gstInclusive: line.gstInclusive,
      taxableAmount: line.taxableAmount,
      gstAmount: line.gstAmount,
      cgst: line.cgst,
      sgst: line.sgst,
      igst: line.igst,
      discountPercent: number(row.discountPercent),
      discountAmount: line.discountAmount,
      mrp: Number(row.mrp || 0),
      wholesalePrice: Number(row.wholesalePrice || 0),
      retailPrice: Number(row.retailPrice || 0),
      sellingPrice: Number(row.sellingPrice || 0),
      netAmount: line.netAmount,
      lineTotal: line.lineTotal
      };
    });
  }

  function resetPurchaseForm() {
    setEditingPurchase(null);
    setPurchaseForm({ purchaseNo: '', supplier: '', invoiceNumber: '', supplierInvoice: '', purchaseDate: new Date().toISOString().slice(0, 10), expectedDeliveryDate: '', paymentStatus: 'Unpaid', remarks: '', freightCharges: 0, roundOff: 0, paidAmount: 0, rows: [{ ...blankRow }] });
  }

  async function savePurchase(event) {
    event.preventDefault();
    if (!purchaseForm.supplier) return toast.error('Select supplier');
    if (!purchaseForm.rows.some((row) => row.product)) return toast.error('Add at least one product');
    const payload = {
      purchaseNo: purchaseForm.purchaseNo || undefined,
      supplier: purchaseForm.supplier || undefined,
      invoiceNumber: purchaseForm.invoiceNumber,
      supplierInvoice: purchaseForm.supplierInvoice || purchaseForm.invoiceNumber,
      purchaseDate: purchaseForm.purchaseDate,
      expectedDeliveryDate: purchaseForm.expectedDeliveryDate || undefined,
      remarks: purchaseForm.remarks,
      freightCharges: Number(purchaseForm.freightCharges || 0),
      roundOff: Number(purchaseForm.roundOff || 0),
      paidAmount: Math.min(Number(purchaseForm.paidAmount || 0), purchaseSummary.total),
      discount: purchaseSummary.discount,
      items: itemPayload(purchaseForm.rows)
    };
    if (editingPurchase) {
      await api.put(`/purchases/${editingPurchase._id}`, payload);
      toast.success('Purchase updated and stock reconciled');
    } else {
      await api.post('/purchases', payload);
      toast.success('Purchase saved and stock updated');
    }
    resetPurchaseForm();
    await load();
  }

  async function editPurchase(purchase) {
    const { data } = await api.get(`/purchases/${purchase._id}`);
    const current = data.purchase;
    setEditingPurchase(current);
    setPurchaseForm({
      purchaseNo: current.purchaseNo || '',
      supplier: current.supplier?._id || current.supplier || '',
      invoiceNumber: current.invoiceNumber || '',
      supplierInvoice: current.supplierInvoice || '',
      purchaseDate: String(current.purchaseDate || '').slice(0, 10),
      expectedDeliveryDate: current.expectedDeliveryDate ? String(current.expectedDeliveryDate).slice(0, 10) : '',
      paymentStatus: current.paymentStatus || 'Unpaid',
      remarks: current.remarks || current.notes || '',
      freightCharges: current.freightCharges || 0,
      roundOff: current.roundOff || 0,
      paidAmount: current.amountPaid ?? current.paidAmount ?? 0,
      rows: (current.items || []).map((item) => ({
        ...blankRow,
        product: item.product?._id || item.product || '',
        pid: item.product?.productId ? String(item.product.productId) : '',
        batchNo: item.batchNo || '',
        expiryDate: item.expiryDate ? String(item.expiryDate).slice(0, 10) : '',
        quantity: item.quantity || 1,
        freeQuantity: item.freeQuantity || 0,
        unit: item.unit || 'pcs',
        costPrice: item.costPrice || item.purchasePrice || 0,
        gstRate: item.gstRate || 0,
        gstInclusive: Boolean(item.gstInclusive),
        discountPercent: item.discountPercent || 0,
        discountAmount: item.discountAmount || 0,
        mrp: item.mrp || 0,
        wholesalePrice: item.wholesalePrice || 0,
        retailPrice: item.retailPrice || item.sellingPrice || 0,
        sellingPrice: item.sellingPrice || item.retailPrice || 0
      }))
    });
  }

  async function duplicatePurchase(purchase) {
    const { data } = await api.post(`/purchases/${purchase._id}/duplicate`);
    toast.success(`Duplicated ${data.purchase.purchaseNo || 'purchase'}`);
    await load();
  }

  async function confirmDeletePurchase() {
    setDeletingPurchase(true);
    try {
      await api.delete(`/purchases/${deletePurchaseTarget._id}`);
      toast.success('Purchase deleted and stock reversed');
      setDeletePurchaseTarget(null);
      await load();
    } finally {
      setDeletingPurchase(false);
    }
  }

  function printPurchase(purchase) {
    const rows = (purchase.items || []).map((item) => `<tr><td>${item.name || item.product?.name || ''}</td><td>${item.quantity || 0}</td><td>${Number(item.costPrice || 0).toFixed(2)}</td><td>${Number(item.gstRate || 0)}%</td><td>${Number(item.lineTotal || item.netAmount || 0).toFixed(2)}</td></tr>`).join('');
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(`<html><body><h2>Purchase ${purchase.purchaseNo || purchase.invoiceNumber || ''}</h2><p>Supplier: ${purchase.supplier?.name || '-'}</p><p>Date: ${dateTime(purchase.purchaseDate || purchase.createdAt)}</p><table border="1" cellpadding="6" cellspacing="0"><thead><tr><th>Product</th><th>Qty</th><th>Price</th><th>GST</th><th>Total</th></tr></thead><tbody>${rows}</tbody></table><h3>Grand Total: ${Number(purchase.grandTotal || purchase.total || 0).toFixed(2)}</h3></body></html>`);
    printWindow.document.close();
    printWindow.print();
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

  function convertOrder(order) {
    setConvertTarget(order);
    setConvertInvoiceNumber(order.poNumber || '');
    setConvertError('');
  }

  async function confirmConvertOrder() {
    const invoiceNumber = convertInvoiceNumber.trim();
    if (!invoiceNumber) {
      setConvertError('Invoice Number is required');
      return;
    }

    setConvertingOrder(true);
    setConvertError('');
    try {
      await api.post(`/purchase-orders/${convertTarget._id}/convert`, { invoiceNumber });
      toast.success('Converted to purchase and stock updated');
      setConvertTarget(null);
      setConvertInvoiceNumber('');
      await load();
    } catch (error) {
      setConvertError(error.response?.data?.message || 'Failed to convert purchase order');
    } finally {
      setConvertingOrder(false);
    }
  }

  function cancelOrder(order) {
    setCancelTarget(order);
  }

  async function confirmCancelOrder() {
    setCancellingOrder(true);
    try {
      await api.post(`/purchase-orders/${cancelTarget._id}/cancel`, {});
      toast.success('Purchase order cancelled');
      setCancelTarget(null);
      await loadPurchaseOrders();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to cancel purchase order');
    } finally {
      setCancellingOrder(false);
    }
  }

  function printPurchaseOrder(order) {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    const rows = (order.items || []).map((item) => `<tr><td>${item.name}</td><td>${item.quantity} ${item.unit || ''}</td><td>${Number(item.receivedQuantity || 0)}</td><td>${Number(item.costPrice || 0).toFixed(2)}</td><td>${Number(item.lineTotal || 0).toFixed(2)}</td></tr>`).join('');
    printWindow.document.write(`<html><body><h2>Purchase Order ${order.poNumber}</h2><p>Supplier: ${order.supplier?.name || '-'}</p><p>Status: ${statusLabels[order.status] || order.status}</p><table border="1" cellpadding="6" cellspacing="0"><thead><tr><th>Product</th><th>Ordered</th><th>Received</th><th>Price</th><th>Total</th></tr></thead><tbody>${rows}</tbody></table><h3>Total: ${Number(order.total || 0).toFixed(2)}</h3></body></html>`);
    printWindow.document.close();
    printWindow.print();
  }

  function renderRows(rows, onProduct, onUpdate, onRemove, formKey) {
    return rows.map((row, index) => {
      const context = row.product ? priceContext[row.product] : null;
      return (
        <tr key={index}>
          <td className="table-td min-w-[90px]">
            <input
              className="input"
              data-row-key={`${formKey}-${index}`}
              data-field="pid"
              inputMode="numeric"
              value={row.pid || ''}
              onChange={(event) => handlePidChange(formKey, index, event.target.value, onProduct, onUpdate)}
              onKeyDown={(event) => handlePidKeyDown(event, formKey, index, row, onProduct)}
              placeholder="PID"
            />
          </td>
          <td className="table-td min-w-[220px]">
            <select
              className="input"
              data-row-key={`${formKey}-${index}`}
              data-field="product"
              value={row.product}
              onChange={(event) => {
                onProduct(index, event.target.value);
                if (event.target.value && event.target.value !== '__new__') focusRowField(formKey, index, 'quantity');
              }}
              onKeyDown={(event) => handleProductKeyDown(event, formKey, index)}
              required
            >
              <option value="">Select product</option>
              <option value="__new__">+ Add New Product</option>
              {products.map((product) => <option key={product._id} value={product._id}>{product.productId ? `${product.productId} - ` : ''}{product.name}</option>)}
            </select>
            {context ? (
              <div className="mt-2 rounded-md border border-slate-200 bg-slate-50 p-2 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                <div>Previous: {currency(context.lastPurchasePrice || 0)} from {context.lastSupplier?.name || '-'}</div>
                <div>Average: {currency(context.averagePurchasePrice || 0)}</div>
              </div>
            ) : null}
          </td>
          <td className="table-td min-w-[90px]"><input className="input" data-row-key={`${formKey}-${index}`} data-field="quantity" type="number" step="0.001" min="0.001" value={row.quantity} onChange={(event) => onUpdate(index, { quantity: event.target.value })} onKeyDown={(event) => handleEntryKeyDown(event, formKey, index, 'unit')} /></td>
          <td className="table-td min-w-[90px]"><input className="input" type="number" step="0.001" min="0" value={row.freeQuantity} onChange={(event) => onUpdate(index, { freeQuantity: event.target.value })} /></td>
          <td className="table-td min-w-[90px]">
            <select className="input" data-row-key={`${formKey}-${index}`} data-field="unit" value={row.unit} onChange={(event) => onUpdate(index, { unit: event.target.value })} onKeyDown={(event) => handleEntryKeyDown(event, formKey, index, 'cost')}>
              {units.map((unit) => <option key={unit._id} value={unit.name}>{unit.name}</option>)}
            </select>
          </td>
          <td className="table-td min-w-[110px]"><input className="input" data-row-key={`${formKey}-${index}`} data-field="cost" type="number" step="0.01" min="0" value={row.costPrice} onChange={(event) => onUpdate(index, { costPrice: event.target.value })} onKeyDown={(event) => handleEntryKeyDown(event, formKey, index, 'gst')} /></td>
          <td className="table-td min-w-[90px]"><input className="input" data-row-key={`${formKey}-${index}`} data-field="gst" type="number" step="0.01" min="0" value={row.gstRate} onChange={(event) => onUpdate(index, { gstRate: event.target.value })} onKeyDown={(event) => handleEntryKeyDown(event, formKey, index, 'mrp')} /></td>
          <td className="table-td min-w-[90px]"><input className="input" type="number" step="0.01" min="0" value={row.discountPercent} onChange={(event) => onUpdate(index, { discountPercent: event.target.value, discountAmount: '' })} /></td>
          <td className="table-td min-w-[110px]"><input className="input" data-row-key={`${formKey}-${index}`} data-field="mrp" type="number" step="0.01" min="0" value={row.mrp} onChange={(event) => onUpdate(index, { mrp: event.target.value })} onKeyDown={(event) => handleEntryKeyDown(event, formKey, index, 'selling')} /></td>
          <td className="table-td min-w-[110px]"><input className="input" type="number" step="0.01" min="0" value={row.wholesalePrice} onChange={(event) => onUpdate(index, { wholesalePrice: event.target.value })} /></td>
          <td className="table-td min-w-[110px]"><input className="input" type="number" step="0.01" min="0" value={row.retailPrice} onChange={(event) => onUpdate(index, { retailPrice: event.target.value, sellingPrice: event.target.value })} /></td>
          <td className="table-td min-w-[110px]"><input className="input" data-row-key={`${formKey}-${index}`} data-field="selling" type="number" step="0.01" min="0" value={row.sellingPrice} onChange={(event) => onUpdate(index, { sellingPrice: event.target.value })} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); if (formKey === 'purchase') document.getElementById('purchase-add-row')?.focus(); } }} /> </td>
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
              <input className="input" placeholder="Purchase no (auto)" value={purchaseForm.purchaseNo} onChange={(event) => setPurchaseForm((current) => ({ ...current, purchaseNo: event.target.value }))} />
              <input className="input" placeholder="Invoice number" value={purchaseForm.invoiceNumber} onChange={(event) => setPurchaseForm((current) => ({ ...current, invoiceNumber: event.target.value }))} />
              <input className="input" placeholder="Supplier invoice" value={purchaseForm.supplierInvoice} onChange={(event) => setPurchaseForm((current) => ({ ...current, supplierInvoice: event.target.value }))} />
              <input className="input" type="date" value={purchaseForm.purchaseDate} onChange={(event) => setPurchaseForm((current) => ({ ...current, purchaseDate: event.target.value }))} />
              <input className="input" type="date" value={purchaseForm.expectedDeliveryDate} onChange={(event) => setPurchaseForm((current) => ({ ...current, expectedDeliveryDate: event.target.value }))} />
              <input className="input" type="number" min="0" step="0.01" placeholder="Amount paid" value={purchaseForm.paidAmount} onChange={(event) => setPurchaseForm((current) => ({ ...current, paidAmount: event.target.value }))} />
              <input className="input" type="number" step="0.01" placeholder="Freight charges" value={purchaseForm.freightCharges} onChange={(event) => setPurchaseForm((current) => ({ ...current, freightCharges: event.target.value }))} />
              <input className="input" type="number" step="0.01" placeholder="Round off" value={purchaseForm.roundOff} onChange={(event) => setPurchaseForm((current) => ({ ...current, roundOff: event.target.value }))} />
              <input className="input md:col-span-4" placeholder="Remarks" value={purchaseForm.remarks} onChange={(event) => setPurchaseForm((current) => ({ ...current, remarks: event.target.value }))} />
            </div>

            <div className="table-shell">
              <table className="w-full">
                <thead><tr><th className="table-th">PID</th><th className="table-th">Product</th><th className="table-th">Qty</th><th className="table-th">Free</th><th className="table-th">Unit</th><th className="table-th">Cost</th><th className="table-th">GST</th><th className="table-th">Disc %</th><th className="table-th">MRP</th><th className="table-th">Wholesale</th><th className="table-th">Retail</th><th className="table-th">Selling</th><th className="table-th">Total</th><th className="table-th"></th></tr></thead>
                <tbody>{renderRows(purchaseForm.rows, selectPurchaseProduct, updatePurchaseRow, (index) => removeRow(setPurchaseForm, index), 'purchase')}</tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4 dark:border-slate-800">
              <button id="purchase-add-row" type="button" className="btn-muted" onClick={addPurchaseRow}><Plus size={16} />Add Row</button>
              <div className="flex items-center gap-3">
                {editingPurchase ? <button type="button" className="btn-muted" onClick={resetPurchaseForm}>Cancel Edit</button> : null}
                <span className="text-sm text-slate-500">{purchaseSummary.items} items / {purchaseSummary.quantity} qty</span>
                <span className="text-sm text-slate-500">GST {currency(purchaseSummary.gstTotal)} / Discount {currency(purchaseSummary.discount)}</span>
                <strong className="text-lg">{currency(purchaseSummary.total)}</strong>
                <span className="rounded-md bg-orange-50 px-3 py-2 text-sm font-semibold text-orange-700">Outstanding {currency(purchaseOutstanding)}</span>
                <button className="btn-primary">{editingPurchase ? 'Update Purchase' : 'Save Purchase'}</button>
              </div>
            </div>
          </form>

          <div className="panel p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold">Purchase History</h2>
              <div className="flex gap-2">
                <input className="input h-9 w-44" placeholder="Search purchase" value={purchaseSearch} onChange={(event) => setPurchaseSearch(event.target.value)} />
                <button className="btn-muted h-9" onClick={loadPurchases}><Search size={15} /></button>
              </div>
            </div>
            <div className="mt-4 max-h-[calc(100vh-(var(--header-height)+var(--purchase-history-offset)))] space-y-3 overflow-y-auto">
              {purchases.map((purchase) => (
                <div key={purchase._id} className="rounded-md border border-slate-200 p-3 text-sm dark:border-slate-800">
                  <div className="flex justify-between gap-3"><strong>{purchase.purchaseNo || purchase.invoiceNumber || purchase._id.slice(-6).toUpperCase()}</strong><span>{currency(purchase.grandTotal || purchase.total || 0)}</span></div>
                  <div className="mt-1 text-slate-500">{purchase.supplier?.name || '-'} | {dateTime(purchase.purchaseDate || purchase.createdAt)}</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button className="btn-muted h-8 px-2 py-1" onClick={() => setViewPurchase(purchase)} title="View"><Eye size={14} /></button>
                    <button className="btn-muted h-8 px-2 py-1" onClick={() => editPurchase(purchase)} title="Edit"><Pencil size={14} /></button>
                    <button className="btn-muted h-8 px-2 py-1" onClick={() => duplicatePurchase(purchase)} title="Duplicate"><Copy size={14} /></button>
                    <button className="btn-muted h-8 px-2 py-1" onClick={() => printPurchase(purchase)} title="Print"><Printer size={14} /></button>
                    <button className="btn-muted h-8 px-2 py-1 text-red-600" onClick={() => setDeletePurchaseTarget(purchase)} title="Delete"><Trash2 size={14} /></button>
                  </div>
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
              </select>
              <input className="input" type="date" value={poForm.expectedDate} onChange={(event) => setPoForm((current) => ({ ...current, expectedDate: event.target.value }))} />
              <select className="input" value={poForm.status} onChange={(event) => setPoForm((current) => ({ ...current, status: event.target.value }))}>
                <option value="draft">Draft</option>
                <option value="pending">Pending</option>
              </select>
              <input className="input" placeholder="Notes" value={poForm.notes} onChange={(event) => setPoForm((current) => ({ ...current, notes: event.target.value }))} />
            </div>
            <div className="table-shell">
              <table className="w-full">
                <thead><tr><th className="table-th">PID</th><th className="table-th">Product</th><th className="table-th">Qty</th><th className="table-th">Free</th><th className="table-th">Unit</th><th className="table-th">Cost</th><th className="table-th">GST</th><th className="table-th">Disc %</th><th className="table-th">MRP</th><th className="table-th">Wholesale</th><th className="table-th">Retail</th><th className="table-th">Selling</th><th className="table-th">Total</th><th className="table-th"></th></tr></thead>
                <tbody>{renderRows(poForm.rows, selectPoProduct, updatePoRow, (index) => removeRow(setPoForm, index), 'po')}</tbody>
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

      {newProductTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="panel w-full max-w-2xl p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold">Add New Product</h2>
              <button type="button" className="btn-muted h-9 w-9 p-0" onClick={() => setNewProductTarget(null)}>
                <XCircle size={16} />
              </button>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <input className="input" placeholder="Product Name" value={newProductForm.name} onChange={(event) => setNewProductForm((current) => ({ ...current, name: event.target.value }))} autoFocus />
              <input className="input" placeholder="Local Language Name" value={newProductForm.localName} onChange={(event) => setNewProductForm((current) => ({ ...current, localName: event.target.value }))} />
              <select className="input" value={newProductForm.category} onChange={(event) => setNewProductForm((current) => ({ ...current, category: event.target.value }))}>
                <option value="">Select category</option>
                {categories.map((category) => <option key={category._id} value={category._id}>{category.name}</option>)}
              </select>
              <select className="input" value={newProductForm.unit} onChange={(event) => setNewProductForm((current) => ({ ...current, unit: event.target.value }))}>
                {units.map((unit) => <option key={unit._id} value={unit.name}>{unit.name}</option>)}
              </select>
              <input className="input" type="number" min="0" step="0.01" placeholder="GST %" value={newProductForm.taxRate} onChange={(event) => setNewProductForm((current) => ({ ...current, taxRate: event.target.value }))} />
              <input className="input" placeholder="Barcode (optional)" value={newProductForm.barcode} onChange={(event) => setNewProductForm((current) => ({ ...current, barcode: event.target.value }))} />
              <input className="input" placeholder="SKU (optional)" value={newProductForm.sku} onChange={(event) => setNewProductForm((current) => ({ ...current, sku: event.target.value }))} />
              <input className="input" type="number" min="0" step="0.01" placeholder="Default Cost" value={newProductForm.purchasePrice} onChange={(event) => setNewProductForm((current) => ({ ...current, purchasePrice: event.target.value }))} />
              <input className="input" type="number" min="0" step="0.01" placeholder="Default Selling Price" value={newProductForm.sellingPrice} onChange={(event) => setNewProductForm((current) => ({ ...current, sellingPrice: event.target.value }))} />
              <input className="input" type="number" min="0" step="0.001" placeholder="Opening Stock (optional)" value={newProductForm.stock} onChange={(event) => setNewProductForm((current) => ({ ...current, stock: event.target.value }))} />
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="btn-muted" onClick={() => setNewProductTarget(null)}>Cancel</button>
              <button type="button" className="btn-primary" disabled={savingProduct} onClick={saveNewProduct}>
                {savingProduct ? 'Saving...' : 'Save Product'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <TextInputDialog
        open={Boolean(convertTarget)}
        title="Convert Purchase Order"
        label="Invoice Number"
        value={convertInvoiceNumber}
        error={convertError}
        confirmLabel="Convert"
        busy={convertingOrder}
        readOnlyRows={[
          { label: 'Purchase Order Number', value: convertTarget?.poNumber },
          { label: 'Supplier Name', value: convertTarget?.supplier?.name }
        ]}
        onChange={(value) => {
          setConvertInvoiceNumber(value);
          if (value.trim()) setConvertError('');
        }}
        onCancel={() => {
          if (convertingOrder) return;
          setConvertTarget(null);
          setConvertInvoiceNumber('');
          setConvertError('');
        }}
        onConfirm={confirmConvertOrder}
      />

      <ConfirmDialog
        open={Boolean(cancelTarget)}
        title="Cancel Purchase Order"
        message={`Cancel ${cancelTarget?.poNumber || 'this purchase order'}?`}
        confirmLabel="Cancel Order"
        danger
        busy={cancellingOrder}
        onCancel={() => {
          if (!cancellingOrder) setCancelTarget(null);
        }}
        onConfirm={confirmCancelOrder}
      />

      <ConfirmDialog
        open={Boolean(deletePurchaseTarget)}
        title="Delete Purchase"
        message={`Delete ${deletePurchaseTarget?.purchaseNo || deletePurchaseTarget?.invoiceNumber || 'this purchase'} and reverse its stock?`}
        confirmLabel="Delete Purchase"
        danger
        busy={deletingPurchase}
        onCancel={() => {
          if (!deletingPurchase) setDeletePurchaseTarget(null);
        }}
        onConfirm={confirmDeletePurchase}
      />

      {viewPurchase ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="panel max-h-[90vh] w-full max-w-3xl overflow-auto p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold">Purchase {viewPurchase.purchaseNo || viewPurchase.invoiceNumber}</h2>
                <p className="text-sm text-slate-500">{viewPurchase.supplier?.name || '-'} | {dateTime(viewPurchase.purchaseDate || viewPurchase.createdAt)}</p>
              </div>
              <button className="btn-muted h-9 w-9 p-0" onClick={() => setViewPurchase(null)}><XCircle size={16} /></button>
            </div>
            <div className="mt-4 table-shell">
              <table className="w-full">
                <thead><tr><th className="table-th">Product</th><th className="table-th">Qty</th><th className="table-th">Free</th><th className="table-th">GST</th><th className="table-th">Net</th></tr></thead>
                <tbody>{(viewPurchase.items || []).map((item, index) => <tr key={`${item.product}-${index}`}><td className="table-td">{item.name || item.product?.name}</td><td className="table-td">{item.quantity}</td><td className="table-td">{item.freeQuantity || 0}</td><td className="table-td">{item.gstRate || 0}%</td><td className="table-td">{currency(item.netAmount || item.lineTotal || 0)}</td></tr>)}</tbody>
              </table>
            </div>
            <div className="mt-4 grid gap-2 text-sm md:grid-cols-3">
              <div>Sub Total: <b>{currency(viewPurchase.subTotal || 0)}</b></div>
              <div>GST: <b>{currency(viewPurchase.gstTotal || 0)}</b></div>
              <div>Discount: <b>{currency(viewPurchase.discount || 0)}</b></div>
              <div>Freight: <b>{currency(viewPurchase.freightCharges || 0)}</b></div>
              <div>Round Off: <b>{currency(viewPurchase.roundOff || 0)}</b></div>
              <div>Grand Total: <b>{currency(viewPurchase.grandTotal || viewPurchase.total || 0)}</b></div>
              <div>Paid: <b>{currency(viewPurchase.amountPaid || viewPurchase.paidAmount || 0)}</b></div>
              <div>Balance: <b>{currency(viewPurchase.balance || 0)}</b></div>
              <div>Status: <b>{viewPurchase.paymentStatus || '-'}</b></div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
