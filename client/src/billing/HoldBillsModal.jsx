import { useState, useEffect } from 'react';
import { X, Play, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { holdBillAPI } from './billingService.js';
import { currency } from '../utils/format.js';

export default function HoldBillsModal({ isOpen, onClose, onResumeHeldBill }) {
  const [heldBills, setHeldBills] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadHeldBills();
    }
  }, [isOpen]);

  const loadHeldBills = async () => {
    setLoading(true);
    try {
      const { data } = await holdBillAPI.getHeldBills();
      setHeldBills(data.heldBills || []);
    } catch (err) {
      toast.error('Failed to load held bills');
    } finally {
      setLoading(false);
    }
  };

  const handleResume = async (heldBill) => {
    try {
      // Fetch full held bill from server (ensures latest normalized shape)
      const { data } = await holdBillAPI.resumeHeldBill(heldBill._id);
      const full = data.heldBill || data;
      console.log('Hold bill fetched for resume', full?._id || full);

      // Restore the bill to cart / open billing window
      onResumeHeldBill(full);

      // Do not delete held bill here; billing editor will remove on save to prevent accidental loss
      toast.success('Bill resumed (open in editor)');
      onClose();
    } catch (err) {
      console.error(err);
      toast.error('Failed to resume bill');
    }
  };

  const handleDelete = async (heldBillId) => {
    if (!window.confirm('Are you sure? This will discard the held bill.')) return;
    try {
      await holdBillAPI.deleteHeldBill(heldBillId);
      toast.success('Held bill discarded');
      setHeldBills(heldBills.filter((b) => b._id !== heldBillId));
    } catch (err) {
      toast.error('Failed to delete held bill');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-slate-900 rounded-lg shadow-xl max-w-2xl w-full max-h-screen overflow-y-auto">
        <div className="sticky top-0 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">Hold Bills</h2>
          <button onClick={onClose} className="hover:bg-slate-200 dark:hover:bg-slate-700 p-1 rounded">
            <X size={20} />
          </button>
        </div>

        <div className="p-6">
          {loading && <p className="text-center text-slate-500">Loading...</p>}
          {!loading && heldBills.length === 0 && (
            <p className="text-center text-slate-500">No held bills</p>
          )}
          {!loading && heldBills.length > 0 && (
            <div className="space-y-3">
              {heldBills.map((heldBill) => (
                <div
                  key={heldBill._id}
                  className="border border-slate-200 dark:border-slate-700 rounded-lg p-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50"
                >
                  <div className="flex-1">
                    <p className="font-semibold text-sm">{heldBill.items?.length || 0} items</p>
                    <p className="text-xs text-slate-500">
                      {(heldBill.items || []).slice(0, 3).map((item) => `${item.productName || item.name}: ${item.quantity || item.qty} ${item.unit || 'pcs'}`).join(', ')}
                    </p>
                    <p className="text-xs text-slate-500">
                      {heldBill.customerMobile && `Customer: ${heldBill.customerMobile}`}
                    </p>
                    <p className="text-sm font-bold text-green-600 dark:text-green-400 mt-1">
                      {currency(heldBill.total)}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleResume(heldBill)}
                      className="btn-primary flex items-center gap-1"
                      title="Resume bill"
                    >
                      <Play size={16} /> Resume
                    </button>
                    <button
                      onClick={() => handleDelete(heldBill._id)}
                      className="btn-muted text-red-600 dark:text-red-400"
                      title="Discard bill"
                    >
                      <Trash2 size={16} />
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
