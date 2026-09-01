import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, NavLink, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import {
  ChevronDown,
  ChevronRight,
  Download,
  FileSpreadsheet,
  FileText,
  Plus,
  Printer,
  RefreshCw,
  Search,
  SlidersHorizontal
} from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../api/http.js';
import { PageHeader } from '../components/PageHeader.jsx';
import { currency, dateTime } from '../utils/format.js';
import { centerStats, flatReports, reportByPath, reportGroups } from './reportDefinitions.js';

const PAGE_SIZE = 25;
const PAYMENT_METHODS = ['', 'Cash', 'Bank', 'UPI', 'Card', 'Cheque', 'Wallet', 'cash', 'credit', 'card', 'upi'];
const STATUS_OPTIONS = ['', 'Paid', 'Partial', 'Unpaid', 'Completed', 'Posted', 'Cancelled'];
const SALES_TYPES = ['', 'Retail', 'Wholesale', 'Credit', 'Cash'];

function today() {
  return new Date().toISOString().slice(0, 10);
}

function toDateInput(date) {
  return date.toISOString().slice(0, 10);
}

function presetRange(preset = 'month') {
  const now = new Date();
  const start = new Date(now);
  const end = new Date(now);
  if (preset === 'yesterday') {
    start.setDate(now.getDate() - 1);
    end.setDate(now.getDate() - 1);
  } else if (preset === 'week') {
    start.setDate(now.getDate() - now.getDay());
  } else if (preset === 'previousMonth') {
    start.setMonth(now.getMonth() - 1, 1);
    end.setDate(0);
  } else if (preset === 'year') {
    start.setMonth(0, 1);
  } else if (preset === 'today') {
    return { from: today(), to: today(), preset };
  } else {
    start.setDate(1);
  }
  return { from: toDateInput(start), to: toDateInput(end), preset };
}

function humanize(value) {
  return String(value || '')
    .replace(/[_-]/g, ' ')
    .replace(/([A-Z])/g, ' $1')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, (char) => char.toUpperCase());
}

function number(value) {
  return Number(value || 0);
}

function asRows(data, report) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (report.dataKey && Array.isArray(data[report.dataKey])) return data[report.dataKey];
  if (Array.isArray(data.rows)) return data.rows;
  if (Array.isArray(data.entries)) return data.entries;
  if (Array.isArray(data.sales)) return data.sales;
  if (Array.isArray(data.products)) return data.products;
  if (Array.isArray(data.returns)) return data.returns;
  return [];
}

function rowDate(row) {
  return row.date || row.createdAt || row.invoiceAt || row.purchaseDate || row.returnDate || row.transactionDate || row.receiptDate || row.paymentDate || row.expenseDate;
}

function partyName(row) {
  return row.customerName || row.supplierName || row.party || row.customer?.name || row.supplier?.name || row.name || row.vendor || 'Walk-in';
}

function docNumber(row) {
  return row.invoiceNumber || row.invoiceNo || row.purchaseNo || row.documentNo || row.returnNo || row.receiptNo || row.voucherNo || row.expenseNo || row.referenceNumber || '-';
}

function rowText(row) {
  return Object.values(row || {}).map((value) => {
    if (value && typeof value === 'object') return Object.values(value).join(' ');
    return String(value ?? '');
  }).join(' ').toLowerCase();
}

function downloadBlob(data, filename) {
  const url = URL.createObjectURL(data);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function csvEscape(value) {
  const text = value instanceof Date ? value.toISOString() : String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function exportCsv(report, columns, rows) {
  const csv = [
    columns.map((column) => column.label),
    ...rows.map((row) => columns.map((column) => csvEscape(column.exportValue ? column.exportValue(row) : column.value(row))))
  ].map((line) => line.join(',')).join('\n');
  downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `${report.id}.csv`);
}

function printReport() {
  window.print();
}

function ReportsSidebar() {
  const [open, setOpen] = useState(() => new Set(reportGroups.map((group) => group.id)));
  const toggle = (id) => setOpen((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  return (
    <aside className="panel h-fit max-h-[calc(100vh-7rem)] overflow-auto p-2">
      <NavLink to="/reports" end className={({ isActive }) => `mb-1 flex items-center rounded-md px-3 py-2 text-sm font-semibold ${isActive ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' : 'text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800'}`}>
        Reports
      </NavLink>
      {reportGroups.map((group) => {
        const Icon = group.icon;
        const isOpen = open.has(group.id);
        return (
          <div key={group.id} className="border-t border-slate-100 py-1 first:border-t-0 dark:border-slate-800">
            <button className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800" onClick={() => toggle(group.id)}>
              {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <Icon size={15} />
              <span className="min-w-0 flex-1 truncate">{group.title}</span>
            </button>
            {isOpen ? (
              <div className="space-y-0.5 pb-1 pl-7">
                {group.reports.map((report) => (
                  <NavLink
                    key={report.id}
                    to={report.path}
                    className={({ isActive }) => `block truncate rounded-md px-3 py-1.5 text-sm ${isActive ? 'bg-emerald-50 font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' : 'text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800'}`}
                  >
                    {report.title}
                  </NavLink>
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
    </aside>
  );
}

function ReportsShell({ children }) {
  return (
    <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
      <ReportsSidebar />
      <main className="min-w-0">{children}</main>
    </div>
  );
}

function ReportsCenter() {
  return (
    <ReportsShell>
      <PageHeader title="Reports" description="Report center for transactions, accounting, stock, GST, expenses, parties and business summaries." />
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {centerStats.map(({ label, value, icon: Icon }) => (
          <div key={label} className="panel p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase text-slate-500">{label}</span>
              <Icon size={18} className="text-emerald-600" />
            </div>
            <b className="mt-2 block text-2xl text-slate-950 dark:text-white">{value}</b>
          </div>
        ))}
      </div>
      <div className="grid gap-4 2xl:grid-cols-2">
        {reportGroups.map((group) => {
          const Icon = group.icon;
          return (
            <section key={group.id} className="panel p-4">
              <div className="mb-3 flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-md bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"><Icon size={18} /></span>
                <div>
                  <h2 className="font-semibold text-slate-950 dark:text-white">{group.title}</h2>
                  <p className="text-xs text-slate-500">{group.reports.length} dedicated reports</p>
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {group.reports.map((report) => (
                  <Link key={report.id} to={report.path} className="rounded-md border border-slate-200 p-3 text-sm transition hover:border-emerald-300 hover:bg-emerald-50/50 dark:border-slate-800 dark:hover:border-emerald-800 dark:hover:bg-emerald-950/20">
                    <span className="font-semibold text-slate-900 dark:text-white">{report.title}</span>
          <span className="mt-1 block text-xs text-slate-500">{report.description}</span>
                  </Link>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </ReportsShell>
  );
}

function DateRangeFilter({ range, onChange, error }) {
  const presets = [
    ['today', 'Today'],
    ['yesterday', 'Yesterday'],
    ['week', 'This Week'],
    ['month', 'This Month'],
    ['previousMonth', 'Previous Month'],
    ['year', 'This Year'],
    ['custom', 'Custom']
  ];
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {presets.map(([key, label]) => (
          <button key={key} className={range.preset === key ? 'btn-primary py-1.5' : 'btn-muted py-1.5'} onClick={() => onChange(key === 'custom' ? { ...range, preset: 'custom' } : presetRange(key))}>{label}</button>
        ))}
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <label className="text-xs font-semibold uppercase text-slate-500">From<input className="input mt-1" type="date" value={range.from} onChange={(event) => onChange({ ...range, from: event.target.value, preset: 'custom' })} /></label>
        <label className="text-xs font-semibold uppercase text-slate-500">To<input className="input mt-1" type="date" value={range.to} onChange={(event) => onChange({ ...range, to: event.target.value, preset: 'custom' })} /></label>
      </div>
      {error ? <p className="mt-2 text-sm font-medium text-rose-600">{error}</p> : null}
    </div>
  );
}

function ReportFilters({ report, range, setRange, filters, setFilters, search, setSearch, dateError }) {
  return (
    <div className="panel mb-4 p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
        <SlidersHorizontal size={16} />
        Filters
      </div>
      <div className="grid gap-4 2xl:grid-cols-[minmax(360px,1fr)_minmax(280px,420px)]">
        <DateRangeFilter range={range} onChange={setRange} error={dateError} />
        <div className="grid content-start gap-3">
          <label className="text-xs font-semibold uppercase text-slate-500">Search<input data-report-search className="input mt-1" placeholder={searchPlaceholder(report)} value={search} onChange={(event) => setSearch(event.target.value)} /></label>
          <div className="grid gap-3 sm:grid-cols-2">
            {(report.id.includes('sales') || report.id === 'sales' || report.id === 'all-transactions' || report.id.includes('purchase') || report.id.includes('cash') || report.id.includes('bank')) ? (
              <label className="text-xs font-semibold uppercase text-slate-500">Payment Method<select className="input mt-1" value={filters.paymentMethod} onChange={(event) => setFilters({ ...filters, paymentMethod: event.target.value })}>{PAYMENT_METHODS.map((item) => <option key={item} value={item}>{item || 'All Methods'}</option>)}</select></label>
            ) : null}
            {(report.id.includes('sales') || report.id.includes('purchase') || report.id.includes('expense')) ? (
              <label className="text-xs font-semibold uppercase text-slate-500">Status<select className="input mt-1" value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}>{STATUS_OPTIONS.map((item) => <option key={item} value={item}>{item || 'All Status'}</option>)}</select></label>
            ) : null}
            {report.id === 'sales' ? (
              <label className="text-xs font-semibold uppercase text-slate-500">Sales Type<select className="input mt-1" value={filters.salesType} onChange={(event) => setFilters({ ...filters, salesType: event.target.value })}>{SALES_TYPES.map((item) => <option key={item} value={item}>{item || 'All Sales Types'}</option>)}</select></label>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function searchPlaceholder(report) {
  if (report.id.includes('purchase')) return 'Purchase number or supplier';
  if (report.id.includes('ledger')) return 'Party name, voucher or narration';
  if (report.groupId === 'inventory') return 'Product, SKU or reference';
  if (report.groupId === 'expenses') return 'Expense number, category or vendor';
  return 'Invoice, customer, mobile or reference';
}

function SummaryCards({ cards }) {
  return (
    <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-6">
      {cards.map((card) => (
        <div key={card.label} className="panel p-3">
          <p className="text-xs font-semibold uppercase text-slate-500">{card.label}</p>
          <b className={`mt-1 block break-words text-lg ${card.tone || 'text-slate-950 dark:text-white'}`}>{card.value}</b>
        </div>
      ))}
    </div>
  );
}

function cellValue(row, key) {
  if (key === 'date') return dateTime(rowDate(row));
  if (key === 'document') return docNumber(row);
  if (key === 'party') return partyName(row);
  if (key === 'transaction') return row.transactionType || row.type || row.source || row.referenceType || '-';
  if (key === 'payment') return row.paymentMethod || row.method || row.paymentType || '-';
  if (key === 'subtotal') return currency(row.subtotal || row.taxable || row.amount || 0);
  if (key === 'discount') return currency(row.discount || 0);
  if (key === 'gst') return currency(row.taxTotal || row.taxAmount || row.gstTotal || row.gst || row.gstAmount || 0);
  if (key === 'roundOff') return currency(row.roundOff || row.roundOffTotal || 0);
  if (key === 'total') return currency(row.total || row.amount || row.lineTotal || row.returnAmount || row.refundAmount || row.totalAmount || 0);
  if (key === 'paid') return currency(row.paidAmount || row.amountPaid || row.paid || 0);
  if (key === 'balance') return currency(row.balanceAmount ?? row.balance ?? row.outstanding ?? row.outstandingBalance ?? 0);
  if (key === 'status') return row.paymentStatus || row.status || '-';
  if (key === 'debit') return currency(row.debit || row.cashOut || 0);
  if (key === 'credit') return currency(row.credit || row.cashIn || 0);
  if (key === 'product') return row.product?.name || row.product || row.name || row.productName || '-';
  if (key === 'sku') return row.product?.sku || row.sku || row.productId || '-';
  if (key === 'quantity') return row.quantity ?? row.stock ?? '-';
  if (key === 'stock') return row.stock ?? row.closingStock ?? '-';
  if (key === 'profit') return currency(row.profit || 0);
  if (key === 'totalSpent') return currency(row.totalSpent ?? row.totalPurchases);
  if (key === 'totalPaid') return currency(row.totalPaid ?? row.totalPayments);
  if (key === 'lastPurchase') return dateTime(row.lastPurchase ?? row.lastPurchaseDate ?? row.lastPaymentDate);
  if (['amount', 'openingBalance', 'outstandingBalance', 'purchaseValue', 'quantityIn', 'quantityOut'].includes(key)) {
    return key.startsWith('quantity') ? number(row[key]).toFixed(2) : currency(row[key]);
  }
  return row[key] ?? '-';
}

function columnsFor(report) {
  const money = ['subtotal', 'discount', 'gst', 'roundOff', 'total', 'paid', 'balance', 'debit', 'credit', 'profit'];
  const make = (key, label, align) => ({ key, label, align: align || (money.includes(key) ? 'right' : 'left'), value: (row) => cellValue(row, key) });
  if (report.id === 'sales' || report.id === 'sales-summary') return ['date', 'document', 'party', 'transaction', 'payment', 'subtotal', 'discount', 'gst', 'roundOff', 'total', 'paid', 'balance', 'status'].map((key) => make(key, humanize(key)));
  if (report.id.includes('purchase')) return ['date', 'document', 'party', 'payment', 'subtotal', 'gst', 'discount', 'total', 'paid', 'balance', 'status'].map((key) => make(key, humanize(key)));
  if (report.id.includes('ledger') || report.id === 'party-statement') return ['date', 'document', 'transaction', 'narration', 'debit', 'credit', 'balance'].map((key) => make(key, key === 'document' ? 'Voucher' : humanize(key)));
  if (report.id.includes('outstanding')) return ['party', 'mobile', 'openingBalance', 'totalSpent', 'totalPaid', 'outstandingBalance', 'lastPurchase', 'pendingBills'].map((key) => make(key, humanize(key), ['totalSpent', 'totalPaid', 'outstandingBalance'].includes(key) ? 'right' : 'left'));
  if (report.id.includes('stock') || report.id === 'low-stock' || report.id === 'item-detail') return ['date', 'product', 'sku', 'transaction', 'document', 'quantityIn', 'quantityOut', 'stock', 'purchaseValue'].map((key) => make(key, humanize(key), ['quantityIn', 'quantityOut', 'stock', 'purchaseValue'].includes(key) ? 'right' : 'left'));
  if (report.groupId === 'gst') return ['date', 'document', 'party', 'type', 'product', 'gstRate', 'gst', 'total'].map((key) => make(key, humanize(key), ['gstRate', 'gst', 'total'].includes(key) ? 'right' : 'left'));
  if (report.groupId === 'expenses') return ['date', 'document', 'category', 'expenseName', 'vendor', 'payment', 'amount', 'gst', 'total', 'status'].map((key) => make(key, humanize(key), ['amount', 'gst', 'total'].includes(key) ? 'right' : 'left'));
  return ['date', 'document', 'party', 'transaction', 'payment', 'debit', 'credit', 'balance', 'status'].map((key) => make(key, humanize(key)));
}

function ReportTable({ report, columns, rows, loading, error, sort, setSort, page, setPage }) {
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const start = (page - 1) * PAGE_SIZE;
  const pagedRows = rows.slice(start, start + PAGE_SIZE);

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount, setPage]);

  return (
    <div className="panel overflow-hidden">
      <div className="flex flex-col gap-2 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
        <h2 className="font-semibold text-slate-950 dark:text-white">Transactions</h2>
        <p className="text-sm text-slate-500">Showing {rows.length ? start + 1 : 0}-{Math.min(start + PAGE_SIZE, rows.length)} of {rows.length} records</p>
      </div>
      <div className="table-shell table-sticky">
        <table className="min-w-full">
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.key} className={`table-th whitespace-nowrap ${column.align === 'right' ? 'text-right' : 'text-left'}`}>
                  <button className="inline-flex items-center gap-1" onClick={() => setSort(sort.key === column.key ? { key: column.key, dir: sort.dir === 'asc' ? 'desc' : 'asc' } : { key: column.key, dir: 'asc' })}>
                    {column.label}{sort.key === column.key ? (sort.dir === 'asc' ? ' Asc' : ' Desc') : ''}
                  </button>
                </th>
              ))}
              <th className="table-th text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="table-td text-center text-slate-500" colSpan={columns.length + 1}>Loading {report.title.toLowerCase()}...</td></tr>
            ) : error ? (
              <tr><td className="table-td text-center text-rose-600" colSpan={columns.length + 1}>{error}</td></tr>
            ) : pagedRows.length ? pagedRows.map((row, index) => (
              <tr key={row._id || `${docNumber(row)}-${index}`}>
                {columns.map((column) => <td key={column.key} className={`table-td whitespace-nowrap ${column.align === 'right' ? 'text-right tabular-nums' : ''}`}>{column.value(row)}</td>)}
                <td className="table-td whitespace-nowrap">
                  <div className="flex gap-1">
                    <button className="btn-muted py-1 text-xs" onClick={printReport}>Print</button>
                    {report.id === 'sales' ? <button className="btn-muted py-1 text-xs">View</button> : null}
                  </div>
                </td>
              </tr>
            )) : (
              <tr><td className="table-td py-14 text-center text-slate-500" colSpan={columns.length + 1}>No records found for this report and filter set.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 p-3 dark:border-slate-800">
        <button className="btn-muted py-1.5" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
        <div className="flex flex-wrap gap-1">
          {Array.from({ length: Math.min(pageCount, 5) }, (_, index) => Math.max(1, Math.min(pageCount - 4, page - 2)) + index).filter((value, index, arr) => arr.indexOf(value) === index).map((value) => (
            <button key={value} className={value === page ? 'btn-primary py-1.5' : 'btn-muted py-1.5'} onClick={() => setPage(value)}>{value}</button>
          ))}
        </div>
        <button className="btn-muted py-1.5" disabled={page >= pageCount} onClick={() => setPage(page + 1)}>Next</button>
      </div>
    </div>
  );
}

function UnsupportedReport({ report }) {
  return (
    <ReportsShell>
      <PageHeader title={report.title} description={report.description} actions={<button className="btn-muted" onClick={printReport}><Printer size={16} />Print</button>} />
      <div className="panel p-6">
        <h2 className="font-semibold text-slate-950 dark:text-white">Backend data required</h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">This report has a dedicated route and production UI slot, but StoreDesk does not currently expose enough backend accounting data to calculate it safely.</p>
        <p className="mt-3 rounded-md bg-amber-50 p-3 text-sm font-semibold text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">Required endpoint: {report.requiredEndpoint}</p>
      </div>
    </ReportsShell>
  );
}

function PartySelector({ type, value, onChange }) {
  const [customers, setCustomers] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  useEffect(() => {
    if (type === 'customer' || type === 'party') api.get('/customers', { params: { limit: 1000 } }).then((res) => setCustomers(res.data.customers || []));
    if (type === 'supplier' || type === 'party') api.get('/suppliers', { params: { limit: 1000 } }).then((res) => setSuppliers(res.data.suppliers || []));
    if (type === 'product') api.get('/products', { params: { limit: 1000 } }).then((res) => setProducts(res.data.products || []));
  }, [type]);
  const options = [
    ...customers.map((item) => ({ ...item, type: 'customer' })),
    ...suppliers.map((item) => ({ ...item, type: 'supplier' })),
    ...products.map((item) => ({ ...item, type: 'product' }))
  ];
  return (
    <div className="panel mb-4 p-4">
      <label className="text-xs font-semibold uppercase text-slate-500">Party<select className="input mt-1 max-w-xl" value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Select {type}</option>
        {options.map((item) => <option key={`${item.type}:${item._id}`} value={`${item.type}:${item._id}`}>{item.name || item.productName} - {item.mobile || item.gstNumber || item.sku || item.productId || item._id}</option>)}
      </select></label>
    </div>
  );
}

async function fetchReportPayload(report, params, partyValue) {
  if (report.endpoint === 'combined:transactions') {
    const [sales, purchases, salesReturns, purchaseReturns, cashBook] = await Promise.all([
      api.get('/reports/sales', { params }),
      api.get('/accounting/purchase-ledger', { params }),
      api.get('/reports/sales-returns', { params }),
      api.get('/reports/purchase-returns', { params }),
      api.get('/accounting/cash-book', { params })
    ]);
    return {
      rows: [
        ...(sales.data.sales || []).map((row) => ({ ...row, type: 'Sale' })),
        ...(purchases.data.rows || []).map((row) => ({ ...row, type: 'Purchase' })),
        ...(salesReturns.data.returns || []).map((row) => ({ ...row, type: 'Sales Return' })),
        ...(purchaseReturns.data.returns || []).map((row) => ({ ...row, type: 'Purchase Return' })),
        ...(cashBook.data.rows || []).map((row) => ({ ...row, type: row.type || 'Cash Book' }))
      ].sort((a, b) => new Date(rowDate(b) || 0) - new Date(rowDate(a) || 0))
    };
  }
  if (report.endpoint === 'combined:parties') {
    const [customers, suppliers] = await Promise.all([
      api.get('/customers', { params: { limit: 1000 } }),
      api.get('/suppliers', { params: { limit: 1000 } })
    ]);
    return { rows: [...(customers.data.customers || []).map((row) => ({ ...row, type: 'Customer' })), ...(suppliers.data.suppliers || []).map((row) => ({ ...row, type: 'Supplier' }))] };
  }
  if (report.endpoint === 'ledger:customer' || report.endpoint === 'ledger:supplier' || report.endpoint === 'party-statement') {
    if (!partyValue) return { entries: [] };
    const [partyType, id] = partyValue.includes(':') ? partyValue.split(':') : [report.needsParty, partyValue];
    const path = `/accounting/${partyType === 'supplier' ? 'suppliers' : 'customers'}/${id}/ledger`;
    return (await api.get(path, { params })).data;
  }
  if (report.endpoint === 'item-ledger') {
    if (!partyValue) return { entries: [] };
    return (await api.get(`/accounting/items/${partyValue.replace('product:', '')}/ledger`, { params })).data;
  }
  const nextParams = { ...params };
  if (report.fixedMethod) nextParams.method = report.fixedMethod;
  const payload = (await api.get(report.endpoint, { params: nextParams })).data;
  if (report.fixedType && Array.isArray(payload.rows)) payload.rows = payload.rows.filter((row) => row.type === report.fixedType);
  return payload;
}

function buildParams(range, filters) {
  const params = { from: range.from, to: range.to };
  if (filters.paymentMethod) {
    params.paymentMethod = filters.paymentMethod;
    params.method = filters.paymentMethod;
  }
  if (filters.status) params.status = filters.status;
  return params;
}

function summaryCards(report, data, rows) {
  const sum = (selector) => rows.reduce((total, row) => total + number(selector(row)), 0);
  if (report.summaryType === 'profitLoss') {
    return [
      { label: 'Sales', value: currency(data?.revenue) },
      { label: 'Cost of Goods Sold', value: currency(data?.cost) },
      { label: 'Gross Profit', value: currency(data?.profit), tone: number(data?.profit) >= 0 ? 'text-emerald-700' : 'text-rose-700' },
      { label: 'Invoices', value: data?.invoices || 0 }
    ];
  }
  if (report.summaryType === 'businessSummary') {
    const sales = data?.sales || {};
    const purchases = data?.purchases || {};
    return [
      { label: 'Net Sales', value: currency(sales.netSales) },
      { label: 'Purchase Cost', value: currency(purchases.purchaseCost) },
      { label: 'Customer Outstanding', value: currency(data?.customers?.customerOutstanding) },
      { label: 'Supplier Outstanding', value: currency(data?.suppliers?.supplierOutstanding) },
      { label: 'Tax Collected', value: currency(data?.tax?.taxCollected) },
      { label: 'Returns', value: currency(data?.returns?.returnAmount) }
    ];
  }
  if (report.summaryType?.includes('Ledger')) {
    return [
      { label: 'Opening Balance', value: currency(data?.openingBalance) },
      { label: 'Total Debit', value: currency(sum((row) => row.debit)) },
      { label: 'Total Credit', value: currency(sum((row) => row.credit)) },
      { label: 'Closing Balance', value: currency(data?.closingBalance ?? rows.at(-1)?.balance) }
    ];
  }
  if (report.summaryType === 'dayBook' || report.summaryType === 'cashBook') {
    const totals = data?.totals || {};
    return [
      { label: 'Opening Balance', value: currency(data?.openingCash || 0) },
      { label: 'Total Debit / Out', value: currency(totals.cashOut || sum((row) => row.cashOut)) },
      { label: 'Total Credit / In', value: currency(totals.cashIn || sum((row) => row.cashIn)) },
      { label: 'Closing Balance', value: currency(totals.closingCash ?? totals.closing ?? 0) }
    ];
  }
  if (report.summaryType === 'stock' || report.summaryType === 'lowStock' || report.summaryType === 'stockMovement') {
    return [
      { label: 'Products / Rows', value: rows.length },
      { label: 'Stock In', value: sum((row) => row.quantityIn || row.purchase || 0).toFixed(2) },
      { label: 'Stock Out', value: sum((row) => row.quantityOut || row.sale || 0).toFixed(2) },
      { label: 'Stock Value', value: currency(data?.totals?.purchaseValue || sum((row) => row.purchaseValue || row.purchasePrice * row.stock)) }
    ];
  }
  return [
    { label: 'Records', value: rows.length },
    { label: 'Total', value: currency(sum((row) => row.total || row.amount || row.lineTotal || row.returnAmount || row.refundAmount || row.totalAmount)) },
    { label: 'Received / Paid', value: currency(sum((row) => row.paidAmount || row.amountPaid || row.paid)) },
    { label: 'Outstanding', value: currency(sum((row) => row.balanceAmount || row.balance || row.outstanding || row.outstandingBalance)) },
    { label: 'Discount', value: currency(sum((row) => row.discount)) },
    { label: 'GST', value: currency(sum((row) => row.taxTotal || row.gstTotal || row.gst || row.gstAmount)) }
  ];
}

function ReportPage({ report }) {
  const navigate = useNavigate();
  const [range, setRange] = useState(() => presetRange(report.preset || 'month'));
  const [filters, setFilters] = useState({ paymentMethod: '', status: '', salesType: '' });
  const [search, setSearch] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sort, setSort] = useState({ key: 'date', dir: 'desc' });
  const [page, setPage] = useState(1);
  const [partyValue, setPartyValue] = useState('');
  const dateError = range.from && range.to && range.from > range.to ? 'From date must be before or equal to To date.' : '';
  const params = useMemo(() => buildParams(range, filters), [range, filters]);

  const refresh = useCallback(async () => {
    if (dateError) return;
    setLoading(true);
    setError('');
    try {
      setData(await fetchReportPayload(report, params, partyValue));
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to load this report.');
    } finally {
      setLoading(false);
    }
  }, [dateError, params, partyValue, report]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const rows = useMemo(() => {
    const base = asRows(data, report);
    const searched = search ? base.filter((row) => rowText(row).includes(search.toLowerCase())) : base;
    const filtered = searched.filter((row) => {
      if (filters.paymentMethod && !rowText({ paymentMethod: row.paymentMethod || row.method || row.paymentType }).includes(filters.paymentMethod.toLowerCase())) return false;
      if (filters.status && String(row.paymentStatus || row.status || '').toLowerCase() !== filters.status.toLowerCase()) return false;
      return true;
    });
    return [...filtered].sort((a, b) => {
      const aValue = sort.key === 'date' ? rowDate(a) : cellValue(a, sort.key);
      const bValue = sort.key === 'date' ? rowDate(b) : cellValue(b, sort.key);
      const result = String(aValue ?? '').localeCompare(String(bValue ?? ''), undefined, { numeric: true });
      return sort.dir === 'asc' ? result : -result;
    });
  }, [data, filters.paymentMethod, filters.status, report, search, sort]);

  const columns = useMemo(() => columnsFor(report), [report]);

  async function downloadServer(format) {
    if (!report.exportBase) {
      toast.error(`${format.toUpperCase()} export needs a backend export endpoint for this report`);
      return;
    }
    try {
      const { data: blob } = await api.get(`${report.exportBase}.${format === 'excel' ? 'xlsx' : format}`, { params, responseType: 'blob' });
      downloadBlob(blob, `${report.id}.${format === 'excel' ? 'xlsx' : format}`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Export failed');
    }
  }

  return (
    <ReportsShell>
      <PageHeader
        title={report.title}
        description={report.description}
        actions={
          <>
            {report.id === 'sales' ? <button className="btn-primary" onClick={() => navigate('/billing')}><Plus size={16} />Add Sale</button> : null}
            {report.needsParty === 'customer' ? <button className="btn-primary" onClick={() => navigate('/accounting/receipts')}><Plus size={16} />Receive Payment</button> : null}
            <button className="btn-muted" onClick={refresh} disabled={loading}><RefreshCw size={16} />Refresh</button>
            <button className="btn-muted" onClick={() => document.querySelector('[data-report-search]')?.focus()}><Search size={16} />Search</button>
            <button className="btn-muted" onClick={() => downloadServer('excel')}><FileSpreadsheet size={16} />Excel</button>
            <button className="btn-muted" onClick={() => downloadServer('pdf')}><FileText size={16} />PDF</button>
            <button className="btn-muted" onClick={() => exportCsv(report, columns, rows)}><Download size={16} />CSV</button>
            <button className="btn-muted" onClick={printReport}><Printer size={16} />Print</button>
          </>
        }
      />
      {report.needsParty ? <PartySelector type={report.needsParty} value={partyValue} onChange={setPartyValue} /> : null}
      <ReportFilters report={report} range={range} setRange={setRange} filters={filters} setFilters={setFilters} search={search} setSearch={setSearch} dateError={dateError} />
      <SummaryCards cards={summaryCards(report, data, rows)} />
      <ReportTable report={report} columns={columns} rows={rows} loading={loading} error={error} sort={sort} setSort={setSort} page={page} setPage={setPage} />
    </ReportsShell>
  );
}

function ReportRoute() {
  const params = useParams();
  const key = params['*'] || '';
  const report = reportByPath.get(key);
  if (!report) return <ReportsCenter />;
  if (report.requiredEndpoint) return <UnsupportedReport report={report} />;
  return <ReportPage report={report} />;
}

export function ReportsModule() {
  return (
    <Routes>
      <Route index element={<ReportsCenter />} />
      <Route path="*" element={<ReportRoute />} />
    </Routes>
  );
}

export { flatReports, reportGroups };
