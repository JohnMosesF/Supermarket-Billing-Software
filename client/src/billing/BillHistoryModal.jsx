import { useState } from 'react';
import { X, Search, Eye, Printer, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { billingAPI } from './billingService.js';
import { currency } from '../utils/format.js';

export default function BillHistoryModal({ isOpen, onClose }) {
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState({
    startDate: '',
    endDate: '',
    paymentMethod: '',
    customerMobile: '',
  });
  const [selectedBill, setSelectedBill] = useState(null);

  const handleSearch = async () => {
    setLoading(true);
    try {
      const { data } = await billingAPI.getBills(filters);
      setBills(data.bills || []);
    } catch (err) {
      toast.error('Failed to fetch bills');
    } finally {
      setLoading(false);
    }
  };

  const handleReprint = async (billId) => {
    try {
      const { data } = await billingAPI.reprintBill(billId);
      // In real app, generate print HTML from data
      window.print();
      toast.success('Bill reprinted');
    } catch (err) {
      toast.error('Failed to reprint bill');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-slate-900 rounded-lg shadow-xl max-w-4xl w-full max-h-screen overflow-y-auto">
        <div className="sticky top-0 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">Bill History</h2>
          <button onClick={onClose} className="hover:bg-slate-200 dark:hover:bg-slate-700 p-1 rounded">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Filters */}
          <div className="grid grid-cols-4 gap-3">
            <div className="col-span-4 grid grid-cols-4 gap-3">
              <input
                type="date"
                value={filters.startDate}
                onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
                className="input text-sm"
                placeholder="Start date"
              />
              <input
                type="date"
                value={filters.endDate}
                onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
                className="input text-sm"
                placeholder="End date"
              />
              <select
                value={filters.paymentMethod}
                onChange={(e) => setFilters({ ...filters, paymentMethod: e.target.value })}
                className="input text-sm"
              >
                <option value="">All Payment Methods</option>
                <option value="cash">Cash</option>
                <option value="upi">UPI</option>
                <option value="card">Card</option>
                <option value="cheque">Cheque</option>
                <option value="wallet">Wallet</option>
                <option value="online">Online</option>
              </select>
              <input
                type="text"
                placeholder="Customer mobile"
                value={filters.customerMobile}
                onChange={(e) => setFilters({ ...filters, customerMobile: e.target.value })}
                className="input text-sm"
              />
            </div>
          </div>
          <button onClick={handleSearch} className="btn-primary w-full">
            <Search size={16} /> Search Bills
          </button>

          {/* Bills List */}
          <div className="mt-6">
            {loading && <p className="text-center text-slate-500">Loading...</p>}
            {!loading && bills.length === 0 && <p className="text-center text-slate-500">No bills found</p>}
            {!loading && bills.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-100 dark:bg-slate-800">
                    <tr>
                      <th className="text-left px-4 py-2">Invoice #</th>
                      <th className="text-left px-4 py-2">Date</th>
                      <th className="text-left px-4 py-2">Customer</th>
                      <th className="text-right px-4 py-2">Total</th>
                      <th className="text-left px-4 py-2">Payment</th>
                      <th className="text-center px-4 py-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {bills.map((bill) => (
                      <tr key={bill._id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <td className="px-4 py-2 font-semibold">{bill.invoiceNo}</td>
                        <td className="px-4 py-2">{new Date(bill.createdAt).toLocaleDateString()}</td>
                        <td className="px-4 py-2">{bill.customerName || '-'}</td>
                        <td className="text-right px-4 py-2 font-bold">${(bill.total || 0).toFixed(2)}</td>
                        <td className="px-4 py-2 capitalize">{bill.paymentMethod}</td>
                        <td className="text-center px-4 py-2">
                          <button
                            onClick={() => setSelectedBill(bill)}
                            className="text-blue-600 hover:text-blue-800 mr-2"
                            title="View"
                          >
                            <Eye size={16} />
                          </button>
                          <button
                            onClick={() => handleReprint(bill._id)}
                            className="text-green-600 hover:text-green-800"
                            title="Reprint"
                          >
                            <Printer size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
