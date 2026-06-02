import { useCallback, useState } from 'react';
import { CreditCard, FilePlus, FileText, FolderPlus, Repeat, Trash2, Printer, Clock, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import BillHistoryModal from './BillHistoryModal.jsx';
import ModifyBillModal from './ModifyBillModal.jsx';
import DeleteBillModal from './DeleteBillModal.jsx';
import HoldBillsModal from './HoldBillsModal.jsx';
import RefundBillModal from './RefundBillModal.jsx';
import TodaysSalesModal from './TodaysSalesModal.jsx';
import { PageHeader } from '../components/PageHeader.jsx';
import { productAPI } from './billingService.js';
import { useEffect } from 'react';

export default function BillingDashboard() {
  const [modals, setModals] = useState({
    history: false,
    modify: false,
    delete: false,
    hold: false,
    refund: false,
    sales: false,
  });

  const openNewBill = useCallback(async () => {
    try {
      const res = await window.electronAPI.createBillingWindow({});
      if (res.ok) {
        toast.success(`New billing window opened - Invoice #${res.invoiceNo}`);
      }
    } catch (err) {
      toast.error('Failed to open billing window');
      console.error(err);
    }
  }, []);

  const toggleModal = (modalName) => {
    setModals((prev) => ({
      ...prev,
      [modalName]: !prev[modalName],
    }));
  };

  const handleResumeHeldBill = async (heldBill) => {
    try {
      console.log('Resume triggered from dashboard', heldBill?._id || heldBill);
      // Open a new billing window and pass resume data
      const opts = { invoiceNo: heldBill?.invoiceNo || undefined, resumeBill: heldBill };
      const res = await window.electronAPI.createBillingWindow(opts);
      console.log('Created billing window for resume', res);
      toast.success('Billing window opened for resume');
    } catch (err) {
      console.error('Failed to open billing window for resume', err);
      toast.error('Failed to open billing window');
    }
  };

  return (
    <div>
      <PageHeader
        title="Billing Control Panel"
        description="Manage all billing operations from this central dashboard. Create, modify, refund, and track invoices."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Create Bill */}
        <button
          onClick={openNewBill}
          className="panel p-6 flex flex-col items-start gap-2 hover:shadow-lg transition hover:bg-blue-50 dark:hover:bg-blue-900/20"
        >
          <FilePlus size={28} className="text-blue-600 dark:text-blue-400" />
          <div className="text-lg font-bold">Create Bill</div>
          <div className="text-sm text-slate-500">Open new POS window</div>
        </button>

        {/* Modify Bill */}
        <button
          onClick={() => toggleModal('modify')}
          className="panel p-6 flex flex-col items-start gap-2 hover:shadow-lg transition hover:bg-purple-50 dark:hover:bg-purple-900/20"
        >
          <FileText size={28} className="text-purple-600 dark:text-purple-400" />
          <div className="text-lg font-bold">Modify Bill</div>
          <div className="text-sm text-slate-500">Edit existing invoice</div>
        </button>

        {/* Delete Bill */}
        <button
          onClick={() => toggleModal('delete')}
          className="panel p-6 flex flex-col items-start gap-2 hover:shadow-lg transition hover:bg-red-50 dark:hover:bg-red-900/20"
        >
          <Trash2 size={28} className="text-red-600 dark:text-red-400" />
          <div className="text-lg font-bold">Delete Bill</div>
          <div className="text-sm text-slate-500">Soft-delete with audit trail</div>
        </button>

        {/* Bill History */}
        <button
          onClick={() => toggleModal('history')}
          className="panel p-6 flex flex-col items-start gap-2 hover:shadow-lg transition hover:bg-blue-50 dark:hover:bg-blue-900/20"
        >
          <Clock size={28} className="text-blue-600 dark:text-blue-400" />
          <div className="text-lg font-bold">Bill History</div>
          <div className="text-sm text-slate-500">Search and filter invoices</div>
        </button>

        {/* Hold Bills */}
        <button
          onClick={() => toggleModal('hold')}
          className="panel p-6 flex flex-col items-start gap-2 hover:shadow-lg transition hover:bg-yellow-50 dark:hover:bg-yellow-900/20"
        >
          <FolderPlus size={28} className="text-yellow-600 dark:text-yellow-400" />
          <div className="text-lg font-bold">Hold Bills</div>
          <div className="text-sm text-slate-500">Resume held bills</div>
        </button>

        {/* Return / Refund */}
        <button
          onClick={() => toggleModal('refund')}
          className="panel p-6 flex flex-col items-start gap-2 hover:shadow-lg transition hover:bg-orange-50 dark:hover:bg-orange-900/20"
        >
          <Repeat size={28} className="text-orange-600 dark:text-orange-400" />
          <div className="text-lg font-bold">Return / Refund</div>
          <div className="text-sm text-slate-500">Process refunds</div>
        </button>

        {/* Today's Sales */}
        <button
          onClick={() => toggleModal('sales')}
          className="panel p-6 flex flex-col items-start gap-2 hover:shadow-lg transition hover:bg-green-50 dark:hover:bg-green-900/20"
        >
          <CreditCard size={28} className="text-green-600 dark:text-green-400" />
          <div className="text-lg font-bold">Today's Sales</div>
          <div className="text-sm text-slate-500">Daily sales summary</div>
        </button>
      </div>

      {/* Low Stock Panel */}
      <div className="mt-6 bg-white p-4 rounded shadow">
        <h3 className="text-lg font-semibold mb-2">Low Stock Items</h3>
        <LowStockList />
      </div>

      {/* Modals */}
      <BillHistoryModal isOpen={modals.history} onClose={() => toggleModal('history')} />
      <ModifyBillModal isOpen={modals.modify} onClose={() => toggleModal('modify')} />
      <DeleteBillModal isOpen={modals.delete} onClose={() => toggleModal('delete')} />
      <HoldBillsModal isOpen={modals.hold} onClose={() => toggleModal('hold')} onResumeHeldBill={handleResumeHeldBill} />
      <RefundBillModal isOpen={modals.refund} onClose={() => toggleModal('refund')} />
      <TodaysSalesModal isOpen={modals.sales} onClose={() => toggleModal('sales')} />
    </div>
  );
}

function LowStockList() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await productAPI.listLowStock(100);
      const payload = (res?.data && (res.data.products || res.data)) || [];
      setItems(Array.isArray(payload) ? payload : []);
    } catch (e) {
      console.error('Failed to load low stock', e);
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const id = setInterval(load, 10000);
    return () => clearInterval(id);
  }, []);

  if (loading && items.length === 0) return <div className="text-sm text-slate-500">Loading low stock items...</div>;
  if (!loading && items.length === 0) return <div className="text-sm text-slate-500">No low stock items</div>;

  return (
    <div className="space-y-2">
      {items.map((p) => (
        <div key={p?._id || Math.random()} className={`flex items-center justify-between p-2 rounded ${Number(p?.stock || 0) <= 0 ? 'bg-red-50' : 'bg-yellow-50'}`}>
          <div>
            <div className="font-medium">{p?.productName || p?.name || 'Unknown Product'}</div>
            <div className="text-xs text-slate-500">SKU: {p?.sku || '-'} • Threshold: {p?.lowStockThreshold ?? '-'}</div>
          </div>
          <div className="text-right">
            <div className="font-semibold">{p?.stock ?? '-'}</div>
            {Number(p?.stock || 0) <= 0 ? <span className="text-xs text-red-600 font-semibold">Out of Stock</span> : <span className="text-xs text-yellow-800">Low Stock</span>}
          </div>
        </div>
      ))}
    </div>
  );
}
