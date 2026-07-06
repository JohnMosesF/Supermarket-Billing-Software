import { useState } from 'react';
import { X, Search, Eye, Printer, Pencil } from 'lucide-react';
import InvoicePreview from './InvoicePreview.jsx';
import { currency } from '../utils/format.js';
import toast from 'react-hot-toast';
import { billingAPI } from './billingService.js';

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
  const [page, setPage] = useState(1);
  const [limit] = useState(25);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const handleSearch = async (requestedPage = 1) => {
    setLoading(true);
    try {
      let data;
      if (searchQuery && searchQuery.trim().length > 0) {
        const res = await billingAPI.searchBills(searchQuery.trim());
        data = res.data;
        // search endpoint returns matching bills (no pagination)
        setBills(data.bills || []);
        setTotalPages(1);
        setTotalCount(data.bills?.length || 0);
        setPage(1);
      } else {
        const params = { ...filters, page: requestedPage, limit };
        const res = await billingAPI.getBills(params);
        data = res.data;
        setBills(data.bills || []);
        setTotalPages(data.pagination?.pages || 1);
        setTotalCount(data.pagination?.total || (data.bills || []).length);
        setPage(Number(data.pagination?.page || requestedPage));
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to fetch bills');
    } finally {
      setLoading(false);
    }
  };

  const handleReprint = async (billId) => {
    try {
      const { data } = await billingAPI.reprintBill(billId);
      // If server returns a print-ready HTML or PDF URL, handle accordingly.
      // Fallback: open print dialog for current window (user can implement print iframe).
      window.print();
      toast.success('Bill reprinted');
    } catch (err) {
      console.error(err);
      toast.error('Failed to reprint bill');
    }
  };

  const handleView = async (bill) => {
    try {
      setLoading(true);
      const { data } = await billingAPI.getBill(bill._id);
      setSelectedBill(data.bill || bill);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load bill');
    } finally {
      setLoading(false);
    }
  };

  const openBillInEditor = async (bill) => {
    try {
      const { data } = await billingAPI.getBill(bill._id);
      const b = data.bill || bill;
      const payload = {
        mode: 'edit',
        editBillId: b._id,
        fullBill: b,
        invoiceNo: b.invoiceNo,
        invoiceNumber: b.invoiceNumber || b.invoiceNo,
        customerName: b.customerName || '',
        customerMobile: b.customerMobile || '',
        paymentMethod: b.paymentMethod || 'Cash',
        paidAmount: b.paidAmount || 0,
        invoiceAt: b.invoiceAt || b.createdAt || null,
        subtotal: b.subtotal || 0,
        taxTotal: b.taxTotal || 0,
        discount: b.discount || 0,
        discountPercent: b.discountPercent || 0,
        total: b.total || 0,
        notes: b.notes || ''
      };
      await window.electronAPI.createBillingWindow({ invoiceNo: b.invoiceNo, resumeBill: payload });
      toast.success('Opened bill for editing');
    } catch (err) {
      console.error('Failed to open billing editor', err);
      toast.error('Failed to open billing editor');
    }
  };

  const handlePage = (newPage) => {
    if (newPage < 1 || newPage > totalPages) return;
    handleSearch(newPage);
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
          {/* Selected bill preview */}
          {selectedBill && (
            <div className="mt-4 border-t pt-4">
              <div className="flex items-start gap-4">
                <div className="flex-1">
                  <h3 className="font-bold">Invoice Preview</h3>
                  <div className="mt-2">
                    {/* Reuse InvoicePreview component by lazy props */}
                    <InvoicePreview
                      state={{
                        invoiceNumber: selectedBill.invoiceNo || selectedBill.invoiceNumber,
                        customerName: selectedBill.customerName,
                      }}
                      cart={selectedBill.items || selectedBill.items || []}
                      totals={{ subtotal: selectedBill.subtotal, taxTotal: selectedBill.taxTotal, discount: selectedBill.discount, total: selectedBill.total }}
                    />
                  </div>
                </div>
                <div className="w-48 flex flex-col gap-2">
                  <button
                    onClick={() => handleView(selectedBill)}
                    className="btn-muted"
                  >
                    <Eye size={14} /> View
                  </button>
                  <button
                    onClick={() => openBillInEditor(selectedBill)}
                    className="btn-primary"
                  >
                    <Pencil size={14} /> Edit
                  </button>
                  <button
                    onClick={() => handleReprint(selectedBill._id)}
                    className="btn-muted"
                  >
                    <Printer size={14} /> Print
                  </button>
                  <button
                    onClick={() => { setSelectedBill(null); }}
                    className="btn-muted"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}
          <div className="flex gap-2">
            <button onClick={() => handleSearch(1)} className="btn-primary flex-1">
              <Search size={16} /> Search Bills
            </button>
            <input
              type="text"
              placeholder="Invoice # or customer mobile"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input w-48"
            />
          </div>

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
                        <td className="px-4 py-2">
                          <button
                            className="text-blue-600 hover:underline font-medium"
                            onClick={() => handleView(bill)}
                          >
                            {bill.invoiceNo}
                          </button>
                        </td>
                        <td className="px-4 py-2">{new Date(bill.createdAt).toLocaleDateString()}</td>
                        <td className="px-4 py-2">{bill.customerName || '-'}</td>
                        <td className="text-right px-4 py-2 font-bold">{currency(bill.total || 0)}</td>
                        <td className="px-4 py-2 capitalize">{bill.paymentMethod}</td>
                        <td className="text-center px-4 py-2">
                          <button
                            onClick={() => handleView(bill)}
                            className="text-blue-600 hover:text-blue-800 mr-2"
                            title="View"
                          >
                            <Eye size={16} />
                          </button>
                          <button
                            onClick={() => openBillInEditor(bill)}
                            className="text-amber-600 hover:text-amber-800 mr-2"
                            title="Edit"
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            onClick={() => handleReprint(bill._id)}
                            className="text-green-600 hover:text-green-800"
                            title="Print"
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
            {/* Pagination controls */}
            {!loading && totalPages > 1 && (
              <div className="mt-3 flex items-center justify-between">
                <div className="text-sm text-slate-600">{totalCount} bills — page {page} of {totalPages}</div>
                <div className="flex gap-2">
                  <button onClick={() => handlePage(page - 1)} className="btn-muted">Prev</button>
                  <button onClick={() => handlePage(page + 1)} className="btn-muted">Next</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
