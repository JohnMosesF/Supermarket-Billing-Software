import { useState, useEffect } from 'react';
import { X, Save, Trash2, Plus, Minus } from 'lucide-react';
import toast from 'react-hot-toast';
import { billingAPI } from './billingService.js';
import { currency } from '../utils/format.js';
import ProductSearch from './ProductSearch.jsx';
import { normalizeBillItem } from '../utils/normalizeBillItem.js';

const itemKey = (item) => {
  const normalized = normalizeBillItem(item);
  return normalized.mongoId || normalized.productId || normalized.sku;
};

export default function ModifyBillModal({ isOpen, onClose }) {
  const [invoiceNo, setInvoiceNo] = useState('');
  const [bill, setBill] = useState(null);
  const [loading, setLoading] = useState(false);
  const [searchingBill, setSearchingBill] = useState(false);

  const handleSearchBill = async () => {
    if (!invoiceNo.trim()) {
      toast.error('Enter invoice number');
      return;
    }
    setSearchingBill(true);
    try {
      const { data } = await billingAPI.searchBills(invoiceNo);
      if (data.bills?.length > 0) {
        setBill(data.bills[0]);
      } else {
        toast.error('Bill not found');
      }
    } catch (err) {
      toast.error('Failed to search bill');
    } finally {
      setSearchingBill(false);
    }
  };

  const handleAddProduct = (product) => {
    if (!bill) return;
    const existing = bill.items.find((item) => String(itemKey(item)) === String(product._id));
    if (existing) {
      existing.quantity = Math.min(existing.quantity + 1, product.stock);
    } else {
      bill.items.push({
        productId: product._id,
        productIdNumber: product.productId,
        sku: product.sku,
        barcode: product.barcode,
        productName: product.name,
        localName: product.localName,
        companyName: product.companyName,
        category: product.category,
        hsnCode: product.hsnCode,
        quantity: 1,
        price: product.sellingPrice,
        gst: product.taxRate,
        purchasePrice: product.purchasePrice,
        sellingPrice: product.sellingPrice,
        wholesalePrice: product.wholesalePrice,
        mrp: product.mrp,
        stockAtSale: product.stock,
        unit: product.unit || 'pcs',
        total: product.sellingPrice
      });
    }
    setBill({ ...bill });
  };

  const handleRemoveItem = (productId) => {
    if (!bill) return;
    setBill({ ...bill, items: bill.items.filter((item) => String(itemKey(item)) !== String(productId)) });
  };

  const handleChangeQty = (productId, delta) => {
    if (!bill) return;
    const item = bill.items.find((entry) => String(itemKey(entry)) === String(productId));
    if (item) {
      item.quantity = Math.max(1, Number(item.quantity || 0) + delta);
      setBill({ ...bill });
    }
  };

  const handleSave = async () => {
    if (!bill) return;
    setLoading(true);
    try {
      const normalizedItems = bill.items.map(normalizeBillItem);
      await billingAPI.updateBill(bill._id, {
        items: normalizedItems.map((item) => ({ ...item, productId: item.mongoId, productIdNumber: item.productId })),
        subtotal: normalizedItems.reduce((sum, item) => sum + item.taxableAmount, 0),
        taxTotal: normalizedItems.reduce((sum, item) => sum + item.gstAmount, 0),
        discount: bill.discount || 0
      });
      toast.success('Bill updated successfully');
      onClose();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to update bill');
    } finally {
      setLoading(false);
    }
  };

  const openInBillingEditor = async () => {
    if (!bill) return;
    try {
      const payload = {
        items: (bill.items || []).map(normalizeBillItem),
        subtotal: bill.subtotal || 0,
        taxTotal: bill.taxTotal || 0,
        discount: bill.discount || 0,
        total: bill.total || 0,
        paymentMethod: bill.paymentMethod || 'Cash',
        customerName: bill.customerName || '',
        customerMobile: bill.customerMobile || null,
        invoiceNo: bill.invoiceNo,
        // include original bill for full fidelity
        fullBill: bill
      };
      payload.invoiceAt = bill.createdAt || bill.invoiceAt || null;
      console.log('Opening billing editor with bill for modify', bill._id);
      await window.electronAPI.createBillingWindow({ invoiceNo: bill.invoiceNo, resumeBill: payload });
      onClose();
      toast.success('Opened billing editor');
    } catch (err) {
      console.error('Failed to open billing editor', err);
      toast.error('Failed to open billing editor');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-slate-900 rounded-lg shadow-xl max-w-2xl w-full max-h-screen overflow-y-auto">
        <div className="sticky top-0 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">Modify Bill</h2>
          <button onClick={onClose} className="hover:bg-slate-200 dark:hover:bg-slate-700 p-1 rounded">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {!bill ? (
            <div className="space-y-3">
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Enter invoice number"
                  value={invoiceNo}
                  onChange={(e) => setInvoiceNo(e.target.value)}
                  className="input flex-1"
                />
                <button
                  onClick={handleSearchBill}
                  disabled={searchingBill}
                  className="btn-primary"
                >
                  Search
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-slate-50 dark:bg-slate-800 p-3 rounded">
                <p className="text-sm">
                  <strong>Invoice:</strong> {bill.invoiceNo}
                </p>
                <p className="text-sm">
                  <strong>Date:</strong> {new Date(bill.createdAt).toLocaleDateString()}
                </p>
              </div>

              <ProductSearch onAddProduct={handleAddProduct} />

              <div className="mt-4">
                <h3 className="font-semibold mb-2 text-sm">Items</h3>
                <div className="overflow-x-auto max-h-60 overflow-y-auto">
                  <div className="grid grid-cols-11 gap-2 min-w-[900px] px-2 pb-1 text-xs font-semibold text-slate-500">
                    <span>PID</span><span>SKU</span><span className="col-span-2">Product / Local</span><span>Unit</span><span>Qty</span><span>Rate</span><span>GST</span><span>Amount</span><span className="col-span-2">Actions</span>
                  </div>
                  {bill.items?.map((item) => {
                      const normalized = normalizeBillItem(item);
                      const pid = itemKey(item);
                      return (
                        <div key={pid} className="grid grid-cols-11 gap-2 min-w-[900px] items-center p-2 bg-slate-50 dark:bg-slate-800 rounded text-xs">
                          <span>{normalized.productId || '-'}</span><span>{normalized.sku || '-'}</span>
                          <div className="col-span-2"><div className="font-semibold">{normalized.productName || '-'}</div><div className="text-slate-500">{normalized.localName || '-'}</div></div>
                          <span>{normalized.unit}</span><span>{normalized.quantity}</span><span>{currency(normalized.price)}</span><span>{normalized.gstRate}%</span><span>{currency(normalized.netAmount)}</span>
                          <div className="flex items-center gap-1 border rounded">
                            <button
                              className="p-1"
                              onClick={() => handleChangeQty(pid, -1)}
                            >
                              <Minus size={14} />
                            </button>
                            <span className="w-6 text-center text-sm">{normalized.quantity}</span>
                            <button
                              className="p-1"
                              onClick={() => handleChangeQty(pid, 1)}
                            >
                              <Plus size={14} />
                            </button>
                          </div>
                          <button
                            onClick={() => handleRemoveItem(pid)}
                            className="text-red-600 hover:text-red-800 p-1"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      );
                    })}
                </div>
              </div>

              <div className="flex gap-2 mt-4">
                <button
                  onClick={handleSave}
                  disabled={loading}
                  className="btn-primary flex-1"
                >
                  <Save size={16} /> Save Changes
                </button>
                <button onClick={openInBillingEditor} className="btn-muted">Open in Billing Editor</button>
                <button onClick={() => setBill(null)} className="btn-muted">
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
