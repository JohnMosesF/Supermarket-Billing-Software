import { useState, useEffect } from 'react';
import { X, Save, Trash2, Plus, Minus } from 'lucide-react';
import toast from 'react-hot-toast';
import { billingAPI } from './billingService.js';
import { currency } from '../utils/format.js';
import ProductSearch from './ProductSearch.jsx';

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
    const existing = bill.items.find((it) => it.product === product._id);
    if (existing) {
      existing.quantity = Math.min(existing.quantity + 1, product.stock);
    } else {
      bill.items.push({
        product: product._id,
        name: product.name,
        quantity: 1,
        sellingPrice: product.sellingPrice,
        taxRate: product.taxRate,
      });
    }
    setBill({ ...bill });
  };

  const handleRemoveItem = (productId) => {
    if (!bill) return;
    setBill({ ...bill, items: bill.items.filter((it) => it.product !== productId) });
  };

  const handleChangeQty = (productId, delta) => {
    if (!bill) return;
    const item = bill.items.find((it) => it.product === productId);
    if (item) {
      item.quantity = Math.max(1, item.quantity + delta);
      setBill({ ...bill });
    }
  };

  const handleSave = async () => {
    if (!bill) return;
    setLoading(true);
    try {
      await billingAPI.updateBill(bill._id, {
        items: bill.items,
        subtotal: bill.items.reduce((s, it) => s + it.sellingPrice * it.quantity, 0),
        taxTotal: bill.items.reduce((s, it) => s + ((it.sellingPrice * it.quantity) * (it.taxRate || 0)) / 100, 0),
      });
      toast.success('Bill updated successfully');
      onClose();
    } catch (err) {
      toast.error('Failed to update bill');
    } finally {
      setLoading(false);
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
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {bill.items?.map((item) => (
                    <div key={item.product} className="flex items-center gap-2 p-2 bg-slate-50 dark:bg-slate-800 rounded">
                      <div className="flex-1">
                        <div className="font-semibold text-sm">{item.name}</div>
                        <div className="text-xs text-slate-500">{currency(item.sellingPrice)}</div>
                      </div>
                      <div className="flex items-center gap-1 border rounded">
                        <button
                          className="p-1"
                          onClick={() => handleChangeQty(item.product, -1)}
                        >
                          <Minus size={14} />
                        </button>
                        <span className="w-6 text-center text-sm">{item.quantity}</span>
                        <button
                          className="p-1"
                          onClick={() => handleChangeQty(item.product, 1)}
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                      <button
                        onClick={() => handleRemoveItem(item.product)}
                        className="text-red-600 hover:text-red-800 p-1"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
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
