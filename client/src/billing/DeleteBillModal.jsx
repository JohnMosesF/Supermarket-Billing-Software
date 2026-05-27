import { useState } from 'react';
import { X, Trash2, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import { billingAPI } from './billingService.js';

export default function DeleteBillModal({ isOpen, onClose }) {
  const [invoiceNo, setInvoiceNo] = useState('');
  const [bill, setBill] = useState(null);
  const [reason, setReason] = useState('');
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
      } else {
        toast.error('Bill not found');
      }
    } catch (err) {
      toast.error('Failed to search bill');
    } finally {
      setSearching(false);
    }
  };

  const handleDelete = async () => {
    if (!bill) return;
    if (!reason.trim()) {
      toast.error('Please provide a reason for deletion');
      return;
    }

    setLoading(true);
    try {
      await billingAPI.deleteBill(bill._id, reason);
      toast.success('Bill deleted successfully (soft delete)');
      setBill(null);
      setInvoiceNo('');
      setReason('');
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete bill');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-slate-900 rounded-lg shadow-xl max-w-md w-full">
        <div className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">Delete Bill</h2>
          <button onClick={onClose} className="hover:bg-slate-200 dark:hover:bg-slate-700 p-1 rounded">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {!bill ? (
            <div className="space-y-3">
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Search for a bill to soft delete it. A deletion reason is required for audit purposes.
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
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4 rounded">
                <p className="font-semibold text-red-700 dark:text-red-400 mb-2">Confirm Delete</p>
                <p className="text-sm text-red-600 dark:text-red-300 mb-2">
                  Invoice: <strong>{bill.invoiceNo}</strong>
                </p>
                <p className="text-sm text-red-600 dark:text-red-300">
                  Total: <strong>₹{bill.total}</strong>
                </p>
                <p className="text-xs text-red-500 dark:text-red-400 mt-2">
                  This action is a soft delete (can be restored from audit logs).
                </p>
              </div>

              <div>
                <label className="text-sm font-semibold mb-2 block">Reason for Deletion *</label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g., Customer requested, Wrong entry, etc."
                  className="input w-full h-20 resize-none text-sm"
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleDelete}
                  disabled={loading || !reason.trim()}
                  className="btn-primary flex-1 text-red-600 bg-red-50 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Trash2 size={16} /> Confirm Delete
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
