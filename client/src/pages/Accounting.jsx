import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Download, Printer, RefreshCw } from 'lucide-react';
import { api } from '../api/http.js';
import { PageHeader } from '../components/PageHeader.jsx';
import { currency, dateTime } from '../utils/format.js';


const today = () => new Date().toISOString().slice(0, 10);
function presetRange(preset) { 
  const now = new Date(); 
  const end = today(); 
  const start = new Date(now); 
  if (preset === 'yesterday') { 
    start.setDate(now.getDate() - 1); 
    return { from: start.toISOString().slice(0, 10), to: start.toISOString().slice(0, 10) };
  } 
  if (preset === 'week') start.setDate(now.getDate() - now.getDay()); 
  else if (preset === 'month') start.setDate(1); 
  return { from: preset === 'today' ? end : start.toISOString().slice(0, 10), to: end }; }
async function download(path, filename) { 
  const { data } = await api.get(path, { responseType: 'blob' }); 
  const url = URL.createObjectURL(data); 
  const anchor = document.createElement('a'); anchor.href = url; 
    anchor.download = filename; anchor.click(); URL.revokeObjectURL(url); }
function printPage() { window.print(); }

export function LedgerPage({ type }) {
  const customer = type === 'customer'; const [parties, setParties] = useState([]); const [partyId, setPartyId] = useState(''); const [search, setSearch] = useState(''); const [range, setRange] = useState(presetRange('month')); const [ledger, setLedger] = useState(null);
  useEffect(() => { api.get(customer ? '/customers' : '/suppliers', { params: customer ? { search, limit: 1000 } : { limit: 1000 } }).then((res) => setParties(res.data[customer ? 'customers' : 'suppliers'] || [])); }, [customer, search]);
  useEffect(() => { if (!partyId) return; api.get(`/accounting/${customer ? 'customers' : 'suppliers'}/${partyId}/ledger`, { params: range }).then((res) => setLedger(res.data)); }, [customer, partyId, range]);
  const base = partyId ? `/accounting/${customer ? 'customers' : 'suppliers'}/${partyId}/ledger` : '';

  const refreshLedger = async () => {
  if (!partyId) return;

  try {
    const { data } = await api.get(
      `/accounting/${customer ? 'customers' : 'suppliers'}/${partyId}/ledger`,
      {
        params: range,
      }
    );

    setLedger(data);
    toast.success('Ledger refreshed');
  } catch (err) {
    console.error(err);
    toast.error('Failed to refresh ledger');
  }
};

  return <div><PageHeader title={`${customer ? 'Customer' : 'Supplier'} Ledger`} description="Auditable running balance rebuilt from source transactions." actions={<><button className="btn-muted" disabled={!partyId} onClick={refreshLedger} > <RefreshCw size={16} /> Refresh </button><button className="btn-muted" disabled={!partyId} onClick={printPage}><Printer size={16}/>Print</button><button className="btn-muted" disabled={!partyId} onClick={() => download(`${base}.xlsx?from=${range.from}&to=${range.to}`, 'ledger.xlsx')}><Download size={16}/>Excel</button><button className="btn-muted" disabled={!partyId} onClick={() => download(`${base}.pdf?from=${range.from}&to=${range.to}`, 'ledger.pdf')}><Download size={16}/>PDF</button></>} />
    <div className="panel p-4"><div className="grid gap-3 md:grid-cols-5"><input className="input" placeholder={customer ? 'Name, mobile or ID' : 'Supplier, GST or mobile'} value={search} onChange={(e) => setSearch(e.target.value)}/><select className="input md:col-span-2" value={partyId} onChange={(e) => setPartyId(e.target.value)}><option value="">Select {customer ? 'customer' : 'supplier'}</option>{parties.filter((p) => !search || `${p.name} ${p.mobile} ${p.gstNumber || ''} ${p._id}`.toLowerCase().includes(search.toLowerCase())).map((p) => <option key={p._id} value={p._id}>{p.name} · {p.mobile || p.gstNumber || p._id}</option>)}</select><input className="input" type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })}/><input className="input" type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })}/></div><div className="mt-3 flex flex-wrap gap-2">{['today','yesterday','week','month'].map((p) => <button className="btn-muted py-1" key={p} onClick={() => setRange(presetRange(p))}>{p.replace(/^./, (c) => c.toUpperCase())}</button>)}</div></div>
    {ledger && <div className="panel mt-5 overflow-x-auto p-5"><div className="mb-3 flex justify-between"><b>Opening Balance: {currency(ledger.openingBalance)}</b><b>Closing Balance: {currency(ledger.closingBalance)}</b></div><table className="w-full"><thead><tr><th className="table-th">Date</th><th className="table-th">Type</th><th className="table-th">Document</th><th className="table-th">Narration</th><th className="table-th">Debit</th><th className="table-th">Credit</th><th className="table-th">Balance</th></tr></thead><tbody>{ledger.entries.map((entry) => <tr key={entry._id}><td className="table-td">{dateTime(entry.transactionDate)}</td><td className="table-td">{entry.transactionType}</td><td className="table-td">{entry.documentNo || '-'}</td><td className="table-td">{entry.narration}</td><td className="table-td">{currency(entry.debit)}</td><td className="table-td">{currency(entry.credit)}</td><td className="table-td font-bold">{currency(entry.balance)}</td></tr>)}</tbody></table></div>}
  </div>;
}

export function OutstandingPage({ type }) {
  const customer = type === 'customer'; 
  const [rows, setRows] = useState([]);
  const navigate = useNavigate();
  useEffect(() => {
    api
      .get(`/accounting/${customer ? 'customers' : 'suppliers'}/outstanding`)
      .then((res) => {
        console.log("FULL RESPONSE:", res);
        console.log("RESPONSE DATA:", res.data);
        console.log("CUSTOMERS:", res.data.customers);

        setRows(res.data[customer ? "customers" : "suppliers"] || []);
      })
      .catch((err) => {
        console.error(err);
      });
  }, [customer]);
  console.log(rows);

  return <div><PageHeader title={`${customer ? 'Customer' : 'Supplier'} Outstanding`} description="Live balances reconciled from invoices, returns, and payments." actions={<button className="btn-muted" onClick={printPage}><Printer size={16}/>Print</button>} /><div className="panel overflow-x-auto p-4"><table className="w-full"><thead><tr><th className="table-th">{customer ? 'Customer' : 'Supplier'}</th><th className="table-th">Mobile</th><th className="table-th">Total</th><th className="table-th">Paid</th><th className="table-th">Balance</th><th className="table-th">Last Activity</th><th className="table-th">Pending</th><th className="table-th">Actions</th></tr></thead><tbody>{rows.map((row) => { console.log(row); const overdue = row.lastPurchase && Date.now() - new Date(row.lastPurchase).getTime() > 30 * 86400000; return <tr key={row._id} className={overdue ? 'bg-red-50 dark:bg-red-950/20' : ''}><td className="table-td font-bold">{row.name}</td><td className="table-td">{row.mobile || '-'}</td><td className="table-td">{currency(customer ? row.totalSpent : row.totalPurchases)}</td><td className="table-td">{currency(customer ? row.totalPaid : row.totalPayments)}</td><td className="table-td font-bold text-red-600">{currency(row.outstandingBalance)}</td><td className="table-td">{dateTime(customer ? row.lastPurchase : row.lastPurchaseDate)}</td><td className="table-td">{customer ? row.pendingBills : '-'}</td><td className="table-td"><div className="flex gap-1"><button className="btn-primary py-1" onClick={() => navigate(customer ? `/accounting/receipts?party=${row._id}` : `/accounting/supplier-payments?party=${row._id}`)}>{customer ? 'Receive' : 'Pay'}</button><button className="btn-muted py-1" onClick={() => navigate(`/accounting/${customer ? 'customer' : 'supplier'}-ledger?party=${row._id}`)}>Ledger</button><button className="btn-muted py-1" onClick={printPage}>Statement</button></div></td></tr>; })}</tbody></table></div></div>;
}

function AllocationEntry({ type }) {
  const customer = type === 'customer'; const [params] = useSearchParams(); const [parties, setParties] = useState([]); const [partyId, setPartyId] = useState(params.get('party') || ''); const [documents, setDocuments] = useState([]); const [amount, setAmount] = useState(''); const [method, setMethod] = useState('Cash'); const [entryDate, setEntryDate] = useState(today()); const [referenceNumber, setReferenceNumber] = useState(''); const [notes, setNotes] = useState(''); const [allocations, setAllocations] = useState({}); const [saved, setSaved] = useState(null);
  useEffect(() => { api.get(customer ? '/customers' : '/suppliers', { params: { limit: 1000 } }).then((res) => setParties(res.data[customer ? 'customers' : 'suppliers'] || [])); }, [customer]);
  useEffect(() => { if (!partyId) return setDocuments([]); api.get(`/accounting/${customer ? 'customers' : 'suppliers'}/${partyId}/${customer ? 'pending-bills' : 'pending-purchases'}`).then((res) => setDocuments(res.data[customer ? 'bills' : 'purchases'] || [])); }, [customer, partyId]);
  const allocated = Object.values(allocations).reduce((sum, value) => sum + Number(value || 0), 0);
  function autoAllocate() { let left = Number(amount || 0); const next = {}; documents.forEach((doc) => { const due = Number(doc.dueAmount ?? doc.balanceAmount ?? 0); const value = Math.min(left, due); if (value > 0) next[doc._id] = value; left -= value; }); setAllocations(next); }
  async function save() { try { const value = Number(amount); if (!partyId || value <= 0) return toast.error('Select a party and enter an amount'); const payload = { [customer ? 'customerId' : 'supplierId']: partyId, amount: value, paymentMethod: method, date: entryDate, referenceNumber, notes, narration: notes, allocations: Object.entries(allocations).filter(([,v]) => Number(v) > 0).map(([id,v]) => ({ [customer ? 'billId' : 'purchaseId']: id, amount: Number(v) })), allocationType: allocated < value ? 'On Account' : 'Allocated' }; const { data } = await api.post(customer ? '/accounting/receipts' : '/accounting/supplier-payments', payload); setSaved(data[customer ? 'receipt' : 'payment']); toast.success(customer ? 'Receipt saved' : 'Payment saved'); setAmount(''); setReferenceNumber(''); setAllocations({}); } catch (err) { toast.error(err.response?.data?.message || 'Save failed'); } }
  return <div><PageHeader title={customer ? 'Customer Payment' : 'Supplier Payment'} description={customer ? 'Allocate full, partial, multiple-invoice, advance, or on-account receipts.' : 'Allocate supplier payments across pending purchases.'} /> <div className="grid gap-5 xl:grid-cols-[360px_1fr]"><div className="panel space-y-3 p-5"><select className="input" value={partyId} onChange={(e) => setPartyId(e.target.value)}><option value="">Select {customer ? 'customer' : 'supplier'}</option>{parties.map((p) => <option key={p._id} value={p._id}>{p.name} · {p.mobile || '-'}</option>)}</select><input className="input" type="number" min="0.01" placeholder="Amount" value={amount} onChange={(e) => setAmount(e.target.value)}/><select className="input" value={method} onChange={(e) => setMethod(e.target.value)}>{['Cash','Bank','UPI','Card','Cheque'].map((m) => <option key={m}>{m}</option>)}</select><textarea className="input" placeholder="Notes" value={notes} onChange={(e) => setNotes(e.target.value)}/><button className="btn-muted w-full" onClick={autoAllocate}>Auto Allocate FIFO</button><p className="text-sm">Allocated {currency(allocated)} · Unallocated {currency(Math.max(Number(amount || 0) - allocated, 0))}</p><button className="btn-primary w-full" onClick={save}>Save & Generate {customer ? 'Receipt' : 'Voucher'}</button>{saved && <button className="btn-muted w-full" onClick={printPage}><Printer size={16}/>Print {saved.receiptNo || saved.voucherNo}</button>}</div><div className="panel overflow-x-auto p-5"><table className="w-full"><thead><tr><th className="table-th">Document</th><th className="table-th">Date</th><th className="table-th">Amount</th><th className="table-th">Balance</th><th className="table-th">Allocate</th></tr></thead><tbody>{documents.map((doc) => { const due = Number(doc.dueAmount ?? doc.balanceAmount ?? 0); return <tr key={doc._id}><td className="table-td">{doc.invoiceNo || doc.invoiceNumber}</td><td className="table-td">{dateTime(doc.invoiceAt || doc.purchaseDate || doc.createdAt)}</td><td className="table-td">{currency(doc.total)}</td><td className="table-td">{currency(due)}</td><td className="table-td"><input className="input w-32" type="number" min="0" max={due} value={allocations[doc._id] || ''} onChange={(e) => setAllocations({ ...allocations, [doc._id]: Math.min(due, Math.max(0, Number(e.target.value))) })}/></td></tr>})}</tbody></table></div></div></div>;
}
export const ReceiptEntry = () => <AllocationEntry type="customer" />;
export const SupplierPaymentEntry = () => <AllocationEntry type="supplier" />;

export function DayBook() { const [date, setDate] = useState(today()); const [data, setData] = useState(null); useEffect(() => { api.get('/accounting/day-book', { params: { date } }).then((res) => setData(res.data)); }, [date]); return <div><PageHeader title="Day Book" description="Chronological cash and business transaction register." actions={<button className="btn-muted" onClick={printPage}><Printer size={16}/>Print</button>}/><div className="panel p-4"><input className="input w-52" type="date" value={date} onChange={(e) => setDate(e.target.value)}/></div>{data && <div className="panel mt-5 p-5"><div className="mb-4 grid gap-3 sm:grid-cols-3"><b>Opening {currency(data.openingCash)}</b><b>Cash In {currency(data.totals.cashIn)}</b><b>Closing {currency(data.totals.closingCash)}</b></div>{data.entries.map((entry) => <div key={entry._id} className="grid grid-cols-6 gap-2 border-b py-2 text-sm"><span>{dateTime(entry.transactionDate)}</span><b>{entry.transactionType}</b><span>{entry.documentNo}</span><span>{entry.createdBy?.name || '-'}</span><span className="text-green-700">In {currency(entry.cashIn)}</span><span className="text-red-700">Out {currency(entry.cashOut)}</span></div>)}</div>}</div>; }

export function CollectionReport() { const [filters, setFilters] = useState({ from: today(), to: today(), paymentMethod: '' }); const [data, setData] = useState({ receipts: [], total: 0 }); useEffect(() => { api.get('/accounting/receipts', { params: filters }).then((res) => setData(res.data)); }, [filters]); const summary = useMemo(() => data.receipts.reduce((map, entry) => ({ ...map, [entry.paymentMethod]: (map[entry.paymentMethod] || 0) + entry.amount }), {}), [data]); return <div><PageHeader title="Collection Report" description="Daily, monthly, customer-wise and payment-method collection register." actions={<button className="btn-muted" onClick={printPage}><Printer size={16}/>Print</button>}/><div className="panel grid gap-3 p-4 md:grid-cols-3"><input className="input" type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })}/><input className="input" type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })}/><select className="input" value={filters.paymentMethod} onChange={(e) => setFilters({ ...filters, paymentMethod: e.target.value })}><option value="">All methods</option>{['Cash','Bank','UPI','Card','Cheque'].map((m) => <option key={m}>{m}</option>)}</select></div><div className="mt-4 flex gap-3">{Object.entries(summary).map(([key,value]) => <div className="panel p-3" key={key}><small>{key}</small><b className="block">{currency(value)}</b></div>)}</div><div className="panel mt-4 overflow-x-auto p-5"><table className="w-full"><thead><tr><th className="table-th">Receipt</th><th className="table-th">Customer</th><th className="table-th">Invoices</th><th className="table-th">Amount</th><th className="table-th">Method</th><th className="table-th">Cashier</th><th className="table-th">Date</th></tr></thead><tbody>{data.receipts.map((entry) => <tr key={entry._id}><td className="table-td">{entry.receiptNo}</td><td className="table-td">{entry.customer?.name}</td><td className="table-td">{entry.allocations.map((a) => a.invoiceNo).join(', ') || 'On Account'}</td><td className="table-td">{currency(entry.amount)}</td><td className="table-td">{entry.paymentMethod}</td><td className="table-td">{entry.createdBy?.name}</td><td className="table-td">{dateTime(entry.receiptDate)}</td></tr>)}</tbody></table><b className="mt-3 block text-right">Total {currency(data.total)}</b></div></div>; }

function RegisterShell({ title, endpoint, columns, totals = [] }) {
  const [filters, setFilters] = useState({ from: today(), to: today(), method: '' });
  const [data, setData] = useState({ rows: [], entries: [], totals: {} });
  useEffect(() => { api.get(endpoint, { params: filters }).then((res) => setData(res.data)); }, [endpoint, filters]);
  const rows = data.rows || data.entries || [];
  return <div><PageHeader title={title} description="Accounting register generated from posted source transactions." actions={<button className="btn-muted" onClick={printPage}><Printer size={16}/>Print</button>} /><div className="panel grid gap-3 p-4 md:grid-cols-3"><input className="input" type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })}/><input className="input" type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })}/><select className="input" value={filters.method} onChange={(e) => setFilters({ ...filters, method: e.target.value })}><option value="">All methods</option>{['Cash','Bank','UPI','Card','Cheque','Wallet'].map((m) => <option key={m}>{m}</option>)}</select></div>{totals.length > 0 && <div className="mt-4 flex flex-wrap gap-3">{totals.map((key) => <div key={key} className="panel p-3"><small>{key}</small><b className="block">{currency(data.totals?.[key] || 0)}</b></div>)}</div>}<div className="panel mt-4 overflow-x-auto p-5"><table className="w-full"><thead><tr>{columns.map((col) => <th key={col.key} className="table-th">{col.label}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={row._id || row.documentNo || row.invoiceNo || index}>{columns.map((col) => <td key={col.key} className="table-td">{col.type === 'date' ? dateTime(row[col.key]) : col.type === 'money' ? currency(row[col.key]) : (col.render ? col.render(row) : row[col.key] || '-')}</td>)}</tr>)}</tbody></table></div></div>;
}

export const SalesLedger = () => <RegisterShell title="Sales Ledger" endpoint="/accounting/sales-ledger" totals={['amount','gst','discount','outstanding']} columns={[{ key: 'date', label: 'Date', type: 'date' }, { key: 'invoiceNo', label: 'Invoice' }, { key: 'customerName', label: 'Customer' }, { key: 'gst', label: 'GST', type: 'money' }, { key: 'discount', label: 'Discount', type: 'money' }, { key: 'amount', label: 'Amount', type: 'money' }, { key: 'outstanding', label: 'Outstanding', type: 'money' }]} />;
export const PurchaseLedger = () => <RegisterShell title="Purchase Ledger" endpoint="/accounting/purchase-ledger" totals={['amount','gst','freight','discount','balance']} columns={[{ key: 'date', label: 'Date', type: 'date' }, { key: 'invoiceNumber', label: 'Invoice' }, { key: 'supplierName', label: 'Supplier' }, { key: 'gst', label: 'GST', type: 'money' }, { key: 'freight', label: 'Freight', type: 'money' }, { key: 'paid', label: 'Paid', type: 'money' }, { key: 'balance', label: 'Balance', type: 'money' }]} />;
export const CashBook = () => <RegisterShell title="Cash Book" endpoint="/accounting/cash-book" totals={['cashIn','cashOut','closing']} columns={[{ key: 'date', label: 'Date', type: 'date' }, { key: 'type', label: 'Type' }, { key: 'documentNo', label: 'Document' }, { key: 'party', label: 'Party' }, { key: 'method', label: 'Method' }, { key: 'cashIn', label: 'In', type: 'money' }, { key: 'cashOut', label: 'Out', type: 'money' }, { key: 'balance', label: 'Balance', type: 'money' }]} />;
export const StockLedger = () => <RegisterShell title="Stock Ledger" endpoint="/accounting/stock-ledger" columns={[{ key: 'createdAt', label: 'Date', type: 'date' }, { key: 'productName', label: 'Product', render: (row) => row.product?.name || '-' }, { key: 'referenceType', label: 'Reference' }, { key: 'openingStock', label: 'Opening' }, { key: 'quantityIn', label: 'In' }, { key: 'quantityOut', label: 'Out' }, { key: 'closingStock', label: 'Closing' }, { key: 'userName', label: 'User', render: (row) => row.user?.name || '-' }]} />;

export function ItemLedger() {
  const [products, setProducts] = useState([]);
  const [productId, setProductId] = useState('');
  const [data, setData] = useState({ product: null, entries: [] });
  useEffect(() => { api.get('/products', { params: { limit: 1000 } }).then((res) => setProducts(res.data.products || [])); }, []);
  useEffect(() => { if (!productId) return setData({ product: null, entries: [] }); api.get(`/accounting/items/${productId}/ledger`).then((res) => setData(res.data)); }, [productId]);
  return <div><PageHeader title="Item Ledger" description="Product-wise running stock history from inventory movements." actions={<button className="btn-muted" onClick={printPage}><Printer size={16}/>Print</button>} /><div className="panel p-4"><select className="input max-w-xl" value={productId} onChange={(e) => setProductId(e.target.value)}><option value="">Select product</option>{products.map((product) => <option key={product._id} value={product._id}>{product.name || product.productName} · {product.sku || product.productId || '-'}</option>)}</select></div><div className="panel mt-4 overflow-x-auto p-5"><table className="w-full"><thead><tr><th className="table-th">Date</th><th className="table-th">Reference</th><th className="table-th">Opening</th><th className="table-th">In</th><th className="table-th">Out</th><th className="table-th">Closing</th><th className="table-th">User</th></tr></thead><tbody>{data.entries.map((entry) => <tr key={entry._id}><td className="table-td">{dateTime(entry.createdAt)}</td><td className="table-td">{entry.referenceType} {entry.referenceNumber || ''}</td><td className="table-td">{entry.openingStock}</td><td className="table-td">{entry.quantityIn}</td><td className="table-td">{entry.quantityOut}</td><td className="table-td font-bold">{entry.closingStock}</td><td className="table-td">{entry.user?.name || '-'}</td></tr>)}</tbody></table></div></div>;
}
