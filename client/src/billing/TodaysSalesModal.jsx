import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import toast from 'react-hot-toast';
import { billingAPI } from './billingService.js';
import { currency } from '../utils/format.js';

export default function TodaysSalesModal({ isOpen, onClose }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadStats();
    }
  }, [isOpen]);

  const loadStats = async () => {
    setLoading(true);
    try {
      const { data } = await billingAPI.getTodaysSales();
      setStats(data);
    } catch (err) {
      toast.error('Failed to load today\'s sales');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const {
    totalSales = 0,
    totalBills = 0,
    totalItems = 0,
    totalTax = 0,
    totalDiscount = 0,
    paymentBreakdown = {}
  } = stats || {};

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-slate-900 rounded-lg shadow-xl max-w-md w-full">
        <div className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">Today's Sales Summary</h2>
          <button onClick={onClose} className="hover:bg-slate-200 dark:hover:bg-slate-700 p-1 rounded">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {loading && <p className="text-center text-slate-500">Loading...</p>}

          {!loading && (
            <div className="space-y-4">
              {/* Main Stats */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg">
                  <p className="text-xs text-green-600 dark:text-green-400">Total Sales</p>
                  <p className="text-2xl font-bold text-green-700 dark:text-green-300">{currency(totalSales)}</p>
                </div>
                <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
                  <p className="text-xs text-blue-600 dark:text-blue-400">Number of Bills</p>
                  <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">{totalBills}</p>
                </div>
                <div className="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-lg">
                  <p className="text-xs text-purple-600 dark:text-purple-400">Items Sold</p>
                  <p className="text-2xl font-bold text-purple-700 dark:text-purple-300">{totalItems}</p>
                </div>
                <div className="bg-orange-50 dark:bg-orange-900/20 p-4 rounded-lg">
                  <p className="text-xs text-orange-600 dark:text-orange-400">Avg Bill Value</p>
                  <p className="text-2xl font-bold text-orange-700 dark:text-orange-300">
                    {currency(totalBills > 0 ? totalSales / totalBills : 0)}
                  </p>
                </div>
              </div>

              {/* Breakdown */}
              <div className="border-t border-slate-200 dark:border-slate-700 pt-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-600 dark:text-slate-400">Subtotal (before tax)</span>
                  <span className="font-semibold">{currency(totalSales - totalTax)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600 dark:text-slate-400">Total Tax (GST)</span>
                  <span className="font-semibold text-blue-600">{currency(totalTax)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600 dark:text-slate-400">Total Discount</span>
                  <span className="font-semibold text-orange-600">{currency(totalDiscount)}</span>
                </div>
              </div>

              {/* Payment Methods */}
              <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
                <p className="font-semibold text-sm mb-2">Payment Methods</p>
                <div className="space-y-2">
                  {Object.entries(paymentBreakdown).map(([method, amount]) => (
                    <div key={method} className="flex justify-between text-sm">
                      <span className="capitalize">{method}</span>
                      <span className="font-semibold">{currency(amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
