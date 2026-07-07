import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Search, RotateCcw, Printer } from 'lucide-react';
import { api } from '../api/http.js';
import { PageHeader } from '../components/PageHeader.jsx';
import { currency, dateTime } from '../utils/format.js';
import { normalizeBillItem } from '../utils/normalizeBillItem.js';
import { printReturnDocument } from '../utils/returnPrint.js';

export function SalesReturns() {
  const [filters, setFilters] = useState({ q: '', date: '', cashier: '' });
  const [bills, setBills] = useState([]);
  const [bill, setBill] = useState(null);
  const [quantities, setQuantities] = useState({});
  const [reason, setReason] = useState('');
  const [preview, setPreview] = useState(false);
  const [history, setHistory] = useState([]);
  const [busy, setBusy] = useState(false);

  const loadHistory = () => api.get('/returns/sales').then((res) => setHistory(res.data.returns || []));
  useEffect(() => { loadHistory(); }, []);
  useEffect(() => {
    const timer = setTimeout(() => api.get('/returns/sales/invoices', { params: filters, silent: true }).then((res) => setBills(res.data.bills || [])).catch(() => {}), 250);
    return () => clearTimeout(timer);
  }, [filters]);

  async function openInvoice(id) {
    const { data } = await api.get(`/returns/sales/invoices/${id}`);
    setBill(data.bill); setQuantities({}); setPreview(false);
  }

  const selected = useMemo(() => (bill?.items || []).map((raw) => {
    const item = normalizeBillItem(raw); const id = item.mongoId; const quantity = Number(quantities[id] || 0);
    return { ...item, id, quantity, refundAmount: item.quantity ? item.netAmount * quantity / item.quantity : 0, returnableQuantity: raw.returnableQuantity };
  }).filter((item) => item.quantity > 0), [bill, quantities]);
  const refund = selected.reduce((sum, item) => sum + item.refundAmount, 0);

  function setAll() { setQuantities(Object.fromEntries((bill?.items || []).map((raw) => { const item = normalizeBillItem(raw); return [item.mongoId, Number(raw.returnableQuantity || 0)]; }))); }
  async function complete() {
    if (!reason.trim()) return toast.error('Enter a return reason');
    if (!selected.length) return toast.error('Select at least one item');
    setBusy(true);
    try {
      const { data } = await api.post('/returns/sales', { billId: bill._id, reason, items: selected.map((item) => ({ productId: item.id, quantity: item.quantity })) });
      toast.success(`Return ${data.salesReturn.returnNo} completed`); setPreview(false); setReason(''); await openInvoice(bill._id); await loadHistory();
    } finally { setBusy(false); }
  }

  return <div>
    <PageHeader title="Sales Return" description="Invoice-linked partial and full returns with automatic stock and customer reconciliation." />
    <div className="panel p-4"><div className="grid gap-3 md:grid-cols-4"><input className="input" placeholder="Invoice, customer, mobile" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })}/><input className="input" type="date" value={filters.date} onChange={(e) => setFilters({ ...filters, date: e.target.value })}/><input className="input" placeholder="Cashier" value={filters.cashier} onChange={(e) => setFilters({ ...filters, cashier: e.target.value })}/><button className="btn-primary"><Search size={16}/>Instant Search</button></div>
      <div className="mt-3 max-h-44 overflow-auto">{bills.map((entry) => <button key={entry._id} onClick={() => openInvoice(entry._id)} className="flex w-full justify-between border-b p-2 text-left hover:bg-slate-50"><span><b>{entry.invoiceNo}</b> · {entry.customerName || 'Walk-in'} · {entry.staff?.name || '-'}</span><span>{currency(entry.total)} · {dateTime(entry.createdAt)}</span></button>)}</div></div>
    {bill && <div className="panel mt-5 p-5"><div className="flex flex-wrap justify-between gap-3"><div><h2 className="text-lg font-bold">Invoice {bill.invoiceNo}</h2><p className="text-sm text-slate-500">{bill.customerName || 'Walk-in'} · {bill.paymentMethod} · {dateTime(bill.invoiceAt || bill.createdAt)}</p></div><button className="btn-muted" onClick={setAll}><RotateCcw size={16}/>Full Return</button></div>
      <div className="mt-4 overflow-x-auto"><table className="w-full"><thead><tr><th className="table-th">Product</th><th className="table-th">Sold</th><th className="table-th">Already Returned</th><th className="table-th">Return Qty</th><th className="table-th">GST</th><th className="table-th">Refund</th></tr></thead><tbody>{bill.items.map((raw) => { const item = normalizeBillItem(raw); const id = item.mongoId; const max = Number(raw.returnableQuantity || 0); const qty = Number(quantities[id] || 0); return <tr key={id}><td className="table-td"><b>{item.productName}</b><div className="text-xs text-slate-500">{item.sku} · {item.unit}</div></td><td className="table-td">{item.quantity}</td><td className="table-td">{raw.returnedQuantity || 0}</td><td className="table-td"><input className="input w-28" type="number" min="0" max={max} step="0.001" value={quantities[id] || ''} onChange={(e) => setQuantities({ ...quantities, [id]: Math.min(max, Math.max(0, Number(e.target.value))) })}/><small className="block">Max {max}</small></td><td className="table-td">{item.gstRate}%</td><td className="table-td">{currency(item.quantity ? item.netAmount * qty / item.quantity : 0)}</td></tr>})}</tbody></table></div>
      <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto_auto]"><input className="input" placeholder="Return reason (required)" value={reason} onChange={(e) => setReason(e.target.value)}/><strong className="self-center">Refund: {currency(refund)}</strong><button className="btn-primary" onClick={() => setPreview(true)}>Preview Return</button></div></div>}
    {preview && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><div className="panel w-full max-w-xl p-5"><h2 className="text-xl font-bold">Confirm Sales Return</h2>{selected.map((item) => <p key={item.id} className="flex justify-between border-b py-2"><span>{item.productName} · {item.quantity} {item.unit}</span><b>{currency(item.refundAmount)}</b></p>)}<p className="mt-3 text-right text-xl font-bold">Refund {currency(refund)}</p><div className="mt-4 flex justify-end gap-2"><button className="btn-muted" onClick={() => setPreview(false)}>Back</button><button className="btn-primary" disabled={busy} onClick={complete}>Complete Return</button></div></div></div>}
    <div className="panel mt-5 p-5"><h2 className="font-bold">Sales Return History</h2>{history.map((entry) => <div key={entry._id} className="mt-2 flex flex-wrap items-center justify-between gap-2 border-b py-2"><span><b>{entry.returnNo}</b> · {entry.originalInvoiceNo} · {entry.customerName || 'Walk-in'}</span><span>{currency(entry.refundAmount)} · {dateTime(entry.returnDate)}</span><span className="flex gap-1">{['72mm','80mm','A4'].map((width) => <button key={width} className="btn-muted py-1" onClick={() => printReturnDocument(entry, 'sales', width)}><Printer size={14}/>{width}</button>)}</span></div>)}</div>
  </div>;
}
