import { useEffect, useState } from 'react';
import { X, ArchiveRestore, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { billingAPI } from './billingService.js';
import { currency } from '../utils/format.js';

export default function DeletedBillsModal({ isOpen, onClose }) {
  const [deletedBills, setDeletedBills] = useState([]);
  const [loading, setLoading] = useState(false);
  const [processingId, setProcessingId] = useState(null);

  useEffect(() => {
    if (!isOpen) return;
    loadDeletedBills();
  }, [isOpen]);

  const loadDeletedBills = async () => {
    setLoading(true);
    try {
      const { data } = await billingAPI.getDeletedBills();
      setDeletedBills(data.deletedBills || []);
    } catch (err) {
      console.error('Failed to load deleted bills', err);
      toast.error('Failed to load deleted bills');
      setDeletedBills([]);
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async (billId) => {
    if (!window.confirm('Restore this deleted bill to active invoices?')) return;
    setProcessingId(billId);
    try {
      await billingAPI.restoreDeletedBill(billId);
      toast.success('Deleted bill restored');
      loadDeletedBills();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to restore deleted bill');
    } finally {
      setProcessingId(null);
    }
  };

  const handlePermanentDelete = async (billId) => {
    if (!window.confirm('Permanently delete this deleted bill? This cannot be undone.')) return;
    setProcessingId(billId);
    try {
      await billingAPI.permanentlyDeleteDeletedBill(billId);
      toast.success('Deleted bill permanently removed');
      loadDeletedBills();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to permanently delete bill');
    } finally {
      setProcessingId(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-slate-900 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
        <div className="sticky top-0 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold">Deleted Bills</h2>
            <p className="text-sm text-slate-500">Restore or permanently remove previously deleted invoices.</p>
          </div>
          <button onClick={onClose} className="hover:bg-slate-200 dark:hover:bg-slate-700 p-1 rounded">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {loading ? (
            <p className="text-slate-500">Loading deleted bills...</p>
          ) : deletedBills.length === 0 ? (
            <p className="text-slate-500">No deleted bills found.</p>
          ) : (
            <div className="space-y-3">
              {deletedBills.map((bill) => (
                <div key={bill._id} className="border border-slate-200 dark:border-slate-700 rounded-lg p-4 bg-white dark:bg-slate-950 shadow-sm">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="text-sm font-semibold">Invoice: {bill.originalData?.invoiceNo || bill.invoiceNo || 'Unknown'}</div>
                      <div className="text-xs text-slate-500">Deleted on: {new Date(bill.createdAt).toLocaleString()}</div>
                      <div className="text-xs text-slate-500">Reason: {bill.reason || 'Not provided'}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold text-slate-900 dark:text-white">{currency(bill.originalData?.total || bill.total || 0)}</div>
                      <div className="text-xs text-slate-500">Items: {bill.originalData?.items?.length || 0}</div>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="btn-primary flex items-center gap-2"
                      onClick={() => handleRestore(bill._id)}
                      disabled={processingId === bill._id}
                    >
                      <ArchiveRestore size={16} /> Restore
                    </button>
                    <button
                      type="button"
                      className="btn-danger flex items-center gap-2"
                      onClick={() => handlePermanentDelete(bill._id)}
                      disabled={processingId === bill._id}
                    >
                      <Trash2 size={16} /> Permanent Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
