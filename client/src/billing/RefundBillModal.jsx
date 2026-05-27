import { useState } from 'react';
import { X, Search, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import { billingAPI, refundAPI } from './billingService.js';
import { currency } from '../utils/format.js';

export default function RefundBillModal({ isOpen, onClose }) {
  const [invoiceNo, setInvoiceNo] = useState('');
  const [bill, setBill] = useState(null);
  const [selectedItems, setSelectedItems] = useState([]);
  const [refundType, setRefundType] = useState('partial'); // 'full' or 'partial'
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);

  const handleSearchBill = async () => {
    if (!invoiceNo.trim()) {
      toast.error('Enter invoice number');
      return;
    }
    setSearching(true);
    try {
      const { data } = await billingAPI.searchBills(invoiceNo);
      if (data.bills?.length > 0) {
        setBill(data.bills[0]);
        setSelectedItems([]);
      } else {
        toast.error('Bill not found');
      }
    } catch (err) {
      toast.error('Failed to search bill');
    } finally {
      setSearching(false);
    }
  };

  const toggleItemSelection = (itemId) => {
    if (selectedItems.includes(itemId)) {
      setSelectedItems(selectedItems.filter((id) => id !== itemId));
    } else {
      setSelectedItems([...selectedItems, itemId]);
    }
  };

  const handleRefund = async () => {
    if (!bill) return;
    if (refundType === 'partial' && selectedItems.length === 0) {
      toast.error('Select items to refund');
      return;
    }

    setLoading(true);
    try {
      const refundItems =
        refundType === 'full'
          ? bill.items
          : bill.items.filter((_, i) => selectedItems.includes(i));

      await refundAPI.createRefund({
        bill: bill._id,
        items: refundItems,
        type: refundType,
        reason: 'Customer return',
      });

      toast.success(`${refundType === 'full' ? 'Full' : 'Partial'} refund processed`);
      setBill(null);
      setInvoiceNo('');
      setSelectedItems([]);
      onClose();
    } catch (err) {
      toast.error('Failed to process refund');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-slate-900 rounded-lg shadow-xl max-w-md w-full max-h-screen overflow-y-auto">
        <div className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">Return / Refund</h2>
          <button onClick={onClose} className="hover:bg-slate-200 dark:hover:bg-slate-700 p-1 rounded">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {!bill ? (
            <div className="space-y-3">
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Search for a bill to process refund.
              </p>
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
                  disabled={searching}
                  className="btn-primary"
                >
                  <Search size={16} />
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded">
                <p className="text-sm">
                  <strong>Invoice:</strong> {bill.invoiceNo}
                </p>
                <p className="text-sm">
                  <strong>Total:</strong> {currency(bill.total)}
                </p>
              </div>

              <div>
                <label className="text-sm font-semibold mb-2 block">Refund Type</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setRefundType('full')}
                    className={`flex-1 py-2 px-3 rounded font-semibold text-sm ${
                      refundType === 'full'
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-200 dark:bg-slate-800'
                    }`}
                  >
                    Full Refund
                  </button>
                  <button
                    onClick={() => setRefundType('partial')}
                    className={`flex-1 py-2 px-3 rounded font-semibold text-sm ${
                      refundType === 'partial'
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-200 dark:bg-slate-800'
                    }`}
                  >
                    Partial Refund
                  </button>
                </div>
              </div>

              {refundType === 'partial' && (
                <div>
                  <label className="text-sm font-semibold mb-2 block">Select Items</label>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {bill.items?.map((item, idx) => (
                      <label
                        key={idx}
                        className="flex items-center gap-2 p-2 bg-slate-50 dark:bg-slate-800 rounded cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700"
                      >
                        <input
                          type="checkbox"
                          checked={selectedItems.includes(idx)}
                          onChange={() => toggleItemSelection(idx)}
                          className="w-4 h-4"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold truncate">{item.name}</p>
                          <p className="text-xs text-slate-500">
                            {item.quantity} × {currency(item.sellingPrice)}
                          </p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={handleRefund}
                  disabled={loading}
                  className="btn-primary flex-1"
                >
                  <Save size={16} /> Process Refund
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
