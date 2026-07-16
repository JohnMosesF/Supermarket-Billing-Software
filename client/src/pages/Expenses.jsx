import { CheckCircle2, Download, Edit2, FileText, Plus, Printer, RotateCcw, Search, Trash2, Upload, XCircle } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { api } from '../api/http.js';
import { PageHeader } from '../components/PageHeader.jsx';
import { currency, dateTime } from '../utils/format.js';

const today = () => new Date().toISOString().slice(0, 10);
const blankCategory = { name: '', code: '', description: '', active: true };
const blankExpense = {
  expenseDate: today(),
  category: '',
  expenseName: '',
  description: '',
  amount: '',
  gstAmount: '',
  paymentMethod: 'Cash',
  referenceNumber: '',
  vendor: '',
  supplier: '',
  remarks: '',
  gstInclusive: false,
  status: 'Posted'
};

function printHtml(html) {
  const win = window.open('about:blank', '_blank');
  if (!win) return toast.error('Print popup was blocked');
  win.document.write(html);
  win.document.close();
  win.focus();
  win.print();
}

const presetRange = (preset) => {
  const now = new Date();
  const start = new Date(now);
  const end = new Date(now);
  const day = now.getDay() || 7;
  if (preset === 'yesterday') { start.setDate(now.getDate() - 1); end.setDate(now.getDate() - 1); }
  if (preset === 'thisWeek') start.setDate(now.getDate() - day + 1);
  if (preset === 'lastWeek') { start.setDate(now.getDate() - day - 6); end.setDate(now.getDate() - day); }
  if (preset === 'thisMonth') start.setDate(1);
  if (preset === 'lastMonth') { start.setMonth(now.getMonth() - 1, 1); end.setDate(0); }
  if (preset === 'financialYear') {
    const fyStartYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    start.setFullYear(fyStartYear, 3, 1);
    end.setFullYear(fyStartYear + 1, 2, 31);
  }
  const iso = (date) => date.toISOString().slice(0, 10);
  return { from: iso(start), to: iso(end) };
};

export function Expenses() {
  const [tab, setTab] = useState('expenses');
  const [categories, setCategories] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [ledger, setLedger] = useState([]);
  const [summary, setSummary] = useState(null);
  const [suppliers, setSuppliers] = useState([]);
  const [categoryForm, setCategoryForm] = useState(blankCategory);
  const [expenseForm, setExpenseForm] = useState(blankExpense);
  const [editingCategory, setEditingCategory] = useState(null);
  const [editingExpense, setEditingExpense] = useState(null);
  const [filters, setFilters] = useState({ search: '', from: today(), to: today(), category: '', vendor: '', user: '', paymentMethod: '', status: '' });
  const [attachment, setAttachment] = useState(null);

  async function loadCategories() {
    const { data } = await api.get('/expenses/categories', { params: { status: 'all', search: filters.categorySearch || '' } });
    setCategories(data.categories || []);
  }

  async function loadExpenses() {
    const params = Object.fromEntries(Object.entries(filters).filter(([, value]) => value));
    const { data } = await api.get('/expenses', { params });
    setExpenses(data.expenses || []);
  }

  async function loadLedger() {
    const params = Object.fromEntries(Object.entries(filters).filter(([, value]) => value));
    const { data } = await api.get('/expenses/ledger', { params });
    setLedger(data.entries || []);
  }

  async function loadSummary() {
    const { data } = await api.get('/expenses/summary');
    setSummary(data);
  }

  async function loadSuppliers() {
    const { data } = await api.get('/suppliers', { params: { active: true }, silent: true }).catch(() => ({ data: { suppliers: [] } }));
    setSuppliers(data.suppliers || []);
  }

  useEffect(() => { loadCategories(); loadSuppliers(); }, []);
  useEffect(() => { loadExpenses(); loadLedger(); loadSummary(); }, [filters]);

  const totalAmount = useMemo(() => Number(expenseForm.amount || 0) + Number(expenseForm.gstAmount || 0), [expenseForm.amount, expenseForm.gstAmount]);

  async function saveCategory(event) {
    event.preventDefault();
    try {
      if (editingCategory) {
        await api.patch(`/expenses/categories/${editingCategory._id}`, categoryForm);
        toast.success('Expense category updated');
      } else {
        await api.post('/expenses/categories', categoryForm);
        toast.success('Expense category created');
      }
      setCategoryForm(blankCategory);
      setEditingCategory(null);
      loadCategories();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save category');
    }
  }

  async function saveExpense(event) {
    event.preventDefault();
    try {
      const formData = new FormData();
      Object.entries(expenseForm).forEach(([key, value]) => formData.append(key, value ?? ''));
      if (attachment) formData.append('attachment', attachment);
      if (editingExpense) {
        await api.patch(`/expenses/${editingExpense._id}`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
        toast.success('Expense updated');
      } else {
        await api.post('/expenses', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
        toast.success('Expense saved');
      }
      setExpenseForm(blankExpense);
      setAttachment(null);
      setEditingExpense(null);
      loadExpenses();
      loadLedger();
      loadSummary();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save expense');
    }
  }

  function editExpense(expense) {
    setEditingExpense(expense);
    setExpenseForm({
      expenseDate: new Date(expense.expenseDate).toISOString().slice(0, 10),
      category: expense.category?._id || expense.category,
      expenseName: expense.expenseName || '',
      description: expense.description || '',
      amount: expense.amount || '',
      gstAmount: expense.gstAmount || '',
      paymentMethod: expense.paymentMethod || 'Cash',
      referenceNumber: expense.referenceNumber || '',
      vendor: expense.vendor || '',
      supplier: expense.supplier?._id || expense.supplier || '',
      remarks: expense.remarks || '',
      gstInclusive: Boolean(expense.gstInclusive),
      status: expense.status || 'Posted'
    });
    setTab('expenses');
  }

  async function printVoucher(expense) {
    const { data } = await api.get(`/expenses/${expense._id}/voucher`);
    printHtml(data.html);
    await api.post(`/expenses/${expense._id}/print`).catch(() => {});
  }

  async function downloadBlob(url, filename) {
    const { data } = await api.get(url, { responseType: 'blob' });
    const href = URL.createObjectURL(data);
    const link = document.createElement('a');
    link.href = href;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(href);
  }

  async function exportDataset(dataset, format) {
    const params = new URLSearchParams(Object.fromEntries(Object.entries(filters).filter(([, value]) => value)));
    await downloadBlob(`/exports/${dataset}.${format}?${params.toString()}`, `${dataset}.${format === 'xlsx' ? 'xlsx' : format}`);
  }

  async function attachmentAction(expense, action) {
    try {
      if (action === 'download') await downloadBlob(`/expenses/${expense._id}/attachment`, expense.attachment?.originalName || expense.attachment?.filename || 'attachment');
      if (action === 'preview') window.open(expense.attachment?.url, '_blank', 'noopener,noreferrer');
      if (action === 'delete') {
        if (!window.confirm('Delete attachment?')) return;
        await api.delete(`/expenses/${expense._id}/attachment`);
        toast.success('Attachment deleted');
        loadExpenses();
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Attachment action failed');
    }
  }

  async function actionExpense(expense, action) {
    try {
      if (action === 'cancel') {
        const reason = window.prompt('Cancellation reason');
        if (!reason) return;
        await api.post(`/expenses/${expense._id}/cancel`, { reason });
      } else if (action === 'delete') {
        if (!window.confirm(`Delete ${expense.expenseNo}?`)) return;
        await api.delete(`/expenses/${expense._id}`);
      } else if (action === 'restore') {
        await api.post(`/expenses/${expense._id}/restore`);
      } else if (action === 'approve') {
        await api.post(`/expenses/${expense._id}/approve`);
      } else if (action === 'reject') {
        const reason = window.prompt('Rejection reason');
        if (!reason) return;
        await api.post(`/expenses/${expense._id}/reject`, { reason });
      } else if (action === 'post') {
        await api.post(`/expenses/${expense._id}/post`);
      }
      toast.success('Expense updated');
      loadExpenses();
      loadLedger();
      loadSummary();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Action failed');
    }
  }

  function editCategory(category) {
    setEditingCategory(category);
    setCategoryForm({ name: category.name || '', code: category.code || '', description: category.description || '', active: category.active !== false });
    setTab('categories');
  }

  return (
    <div>
      <PageHeader title="Expense Management" description="Manage expense categories, vouchers, ledger, attachments, and accounting integration." />
      <div className="mb-4 flex flex-wrap gap-2">
        {[
          ['expenses', 'Expense Entry'],
          ['categories', 'Categories'],
          ['ledger', 'Expense Ledger'],
          ['summary', 'Summary']
        ].map(([key, label]) => (
          <button key={key} className={tab === key ? 'btn-primary' : 'btn-muted'} onClick={() => setTab(key)}>{label}</button>
        ))}
      </div>

      {tab === 'expenses' && (
        <div className="grid gap-5 xl:grid-cols-[380px_1fr]">
          <form className="panel space-y-3 p-5" onSubmit={saveExpense}>
            <h2 className="font-semibold">{editingExpense ? 'Edit Expense' : 'Create Expense'}</h2>
            <input className="input" type="date" value={expenseForm.expenseDate} onChange={(e) => setExpenseForm({ ...expenseForm, expenseDate: e.target.value })} />
            <select className="input" value={expenseForm.category} onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value })} required>
              <option value="">Select category</option>
              {categories.filter((entry) => entry.active !== false).map((entry) => <option key={entry._id} value={entry._id}>{entry.name}</option>)}
            </select>
            <input className="input" placeholder="Expense name" value={expenseForm.expenseName} onChange={(e) => setExpenseForm({ ...expenseForm, expenseName: e.target.value })} required />
            <textarea className="input" placeholder="Description" value={expenseForm.description} onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })} />
            <div className="grid grid-cols-2 gap-2">
              <input className="input" type="number" min="0.01" step="0.01" placeholder="Amount" value={expenseForm.amount} onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })} required />
              <input className="input" type="number" min="0" step="0.01" placeholder="GST amount" value={expenseForm.gstAmount} onChange={(e) => setExpenseForm({ ...expenseForm, gstAmount: e.target.value })} />
            </div>
            <div className="rounded-lg bg-slate-50 p-3 text-sm font-semibold dark:bg-slate-900">Total: {currency(totalAmount)}</div>
            <select className="input" value={expenseForm.paymentMethod} onChange={(e) => setExpenseForm({ ...expenseForm, paymentMethod: e.target.value })}>
              {['Cash', 'UPI', 'Card', 'Bank', 'Cheque', 'Wallet'].map((method) => <option key={method}>{method}</option>)}
            </select>
            <input className="input" placeholder="Reference number" value={expenseForm.referenceNumber} onChange={(e) => setExpenseForm({ ...expenseForm, referenceNumber: e.target.value })} />
            <select className="input" value={expenseForm.supplier} onChange={(e) => {
              const supplier = suppliers.find((entry) => entry._id === e.target.value);
              setExpenseForm({ ...expenseForm, supplier: e.target.value, vendor: supplier?.name || expenseForm.vendor });
            }}>
              <option value="">Free text vendor</option>
              {suppliers.map((supplier) => <option key={supplier._id} value={supplier._id}>{supplier.name}</option>)}
            </select>
            <input className="input" placeholder="Vendor (optional)" value={expenseForm.vendor} onChange={(e) => setExpenseForm({ ...expenseForm, vendor: e.target.value })} />
            <input className="input" type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={(e) => setAttachment(e.target.files?.[0] || null)} />
            {editingExpense?.attachment ? <div className="flex flex-wrap gap-2 text-xs"><button type="button" className="btn-muted" onClick={() => attachmentAction(editingExpense, 'preview')}>Preview</button><button type="button" className="btn-muted" onClick={() => attachmentAction(editingExpense, 'download')}>Download</button><button type="button" className="btn-muted" onClick={() => attachmentAction(editingExpense, 'delete')}>Delete</button></div> : null}
            <textarea className="input" placeholder="Remarks" value={expenseForm.remarks} onChange={(e) => setExpenseForm({ ...expenseForm, remarks: e.target.value })} />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={expenseForm.gstInclusive} onChange={(e) => setExpenseForm({ ...expenseForm, gstInclusive: e.target.checked })} /> GST inclusive</label>
            <select className="input" value={expenseForm.status} onChange={(e) => setExpenseForm({ ...expenseForm, status: e.target.value })}>
              <option>Posted</option>
              <option>Draft</option>
              <option>Pending Approval</option>
              <option>Approved</option>
            </select>
            <div className="flex gap-2">
              <button className="btn-primary flex-1"><Plus size={16} />{editingExpense ? 'Update' : 'Save'}</button>
              {editingExpense ? <button type="button" className="btn-muted" onClick={() => { setEditingExpense(null); setExpenseForm(blankExpense); }}>Cancel</button> : null}
            </div>
          </form>

          <div className="scroll-panel">
            <div className="grid gap-2 border-b border-slate-100 p-4 md:grid-cols-6 dark:border-slate-800">
              <div className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 dark:border-slate-700"><Search size={16} className="text-slate-400" /><input className="w-full bg-transparent py-2 text-sm outline-none" placeholder="Search expenses" value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} /></div>
              <select className="input" onChange={(e) => setFilters({ ...filters, ...presetRange(e.target.value) })} defaultValue="today"><option value="today">Today</option><option value="yesterday">Yesterday</option><option value="thisWeek">This Week</option><option value="lastWeek">Last Week</option><option value="thisMonth">This Month</option><option value="lastMonth">Last Month</option><option value="financialYear">Financial Year</option></select>
              <input className="input" type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} />
              <input className="input" type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} />
              <select className="input" value={filters.category} onChange={(e) => setFilters({ ...filters, category: e.target.value })}><option value="">All categories</option>{categories.map((entry) => <option key={entry._id} value={entry._id}>{entry.name}</option>)}</select>
              <select className="input" value={filters.paymentMethod} onChange={(e) => setFilters({ ...filters, paymentMethod: e.target.value })}><option value="">All methods</option>{['Cash', 'UPI', 'Card', 'Bank', 'Cheque', 'Wallet'].map((method) => <option key={method}>{method}</option>)}</select>
              <select className="input" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}><option value="">All statuses</option>{['Draft', 'Pending Approval', 'Approved', 'Rejected', 'Posted', 'Cancelled', 'Deleted'].map((status) => <option key={status}>{status}</option>)}</select>
              <input className="input" placeholder="Vendor" value={filters.vendor} onChange={(e) => setFilters({ ...filters, vendor: e.target.value })} />
              <input className="input" placeholder="User ID" value={filters.user} onChange={(e) => setFilters({ ...filters, user: e.target.value })} />
              <div className="flex flex-wrap gap-2 md:col-span-3">
                {['csv', 'xlsx', 'pdf'].map((format) => <button key={format} className="btn-muted" type="button" onClick={() => exportDataset('expense-list', format)}><Download size={14} />List {format.toUpperCase()}</button>)}
              </div>
            </div>
            <div className="table-shell">
              <table className="w-full table-sticky">
                <thead><tr><th className="table-th">Voucher</th><th className="table-th">Date</th><th className="table-th">Category</th><th className="table-th">Expense</th><th className="table-th">Total</th><th className="table-th">Method</th><th className="table-th">Status</th><th className="table-th"></th></tr></thead>
                <tbody>
                  {expenses.map((expense) => (
                    <tr key={expense._id}>
                      <td className="table-td font-semibold">{expense.expenseNo}</td>
                      <td className="table-td">{dateTime(expense.expenseDate)}</td>
                      <td className="table-td">{expense.category?.name || expense.categoryName}</td>
                      <td className="table-td">{expense.expenseName}<div className="text-xs text-slate-500">{expense.vendor || expense.referenceNumber || ''}</div></td>
                      <td className="table-td font-semibold">{currency(expense.totalAmount)}</td>
                      <td className="table-td">{expense.paymentMethod}</td>
                      <td className="table-td">{expense.status}</td>
                      <td className="table-td">
                        <div className="flex justify-end gap-1">
                          <button className="btn-muted h-8 w-8 p-0" onClick={() => editExpense(expense)} title="Edit"><Edit2 size={14} /></button>
                          <button className="btn-muted h-8 w-8 p-0" onClick={() => printVoucher(expense)} title="Print voucher"><Printer size={14} /></button>
                          <button className="btn-muted h-8 w-8 p-0" onClick={() => downloadBlob(`/expenses/${expense._id}/voucher.pdf`, `${expense.expenseNo}.pdf`)} title="Export PDF"><FileText size={14} /></button>
                          {expense.attachment ? <button className="btn-muted h-8 w-8 p-0" onClick={() => attachmentAction(expense, 'download')} title="Download attachment"><Upload size={14} /></button> : null}
                          {['Draft', 'Pending Approval'].includes(expense.status) ? <button className="btn-muted h-8 w-8 p-0" onClick={() => actionExpense(expense, 'approve')} title="Approve"><CheckCircle2 size={14} /></button> : null}
                          {expense.status === 'Approved' ? <button className="btn-muted h-8 w-8 p-0" onClick={() => actionExpense(expense, 'post')} title="Post"><CheckCircle2 size={14} /></button> : null}
                          {expense.status === 'Pending Approval' ? <button className="btn-muted h-8 w-8 p-0" onClick={() => actionExpense(expense, 'reject')} title="Reject"><XCircle size={14} /></button> : null}
                          <button className="btn-muted h-8 w-8 p-0" onClick={() => actionExpense(expense, 'cancel')} title="Cancel"><XCircle size={14} /></button>
                          {expense.status === 'Deleted' ? <button className="btn-muted h-8 w-8 p-0" onClick={() => actionExpense(expense, 'restore')} title="Restore"><RotateCcw size={14} /></button> : <button className="btn-muted h-8 w-8 p-0" onClick={() => actionExpense(expense, 'delete')} title="Delete"><Trash2 size={14} /></button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab === 'categories' && (
        <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
          <form className="panel space-y-3 p-5" onSubmit={saveCategory}>
            <h2 className="font-semibold">{editingCategory ? 'Edit Category' : 'Create Category'}</h2>
            <input className="input" placeholder="Category name" value={categoryForm.name} onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })} required />
            <input className="input" placeholder="Category code" value={categoryForm.code} onChange={(e) => setCategoryForm({ ...categoryForm, code: e.target.value.toUpperCase() })} required />
            <textarea className="input" placeholder="Description" value={categoryForm.description} onChange={(e) => setCategoryForm({ ...categoryForm, description: e.target.value })} />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={categoryForm.active} onChange={(e) => setCategoryForm({ ...categoryForm, active: e.target.checked })} /> Active</label>
            <div className="flex gap-2"><button className="btn-primary flex-1"><Plus size={16} />Save</button><button type="button" className="btn-muted" onClick={() => api.post('/expenses/categories/seed').then(() => { toast.success('Defaults ready'); loadCategories(); })}>Defaults</button></div>
          </form>
          <div className="panel overflow-x-auto p-5">
            <table className="w-full"><thead><tr><th className="table-th">Name</th><th className="table-th">Code</th><th className="table-th">Description</th><th className="table-th">Status</th><th className="table-th"></th></tr></thead><tbody>{categories.map((category) => <tr key={category._id}><td className="table-td font-semibold">{category.name}</td><td className="table-td">{category.code}</td><td className="table-td">{category.description || '-'}</td><td className="table-td">{category.active === false ? 'Inactive' : 'Active'}</td><td className="table-td text-right"><button className="btn-muted h-8 w-8 p-0" onClick={() => editCategory(category)}><Edit2 size={14} /></button></td></tr>)}</tbody></table>
          </div>
        </div>
      )}

      {tab === 'ledger' && (
        <div className="panel overflow-x-auto p-5">
          <div className="mb-3 flex flex-wrap gap-2">{['csv', 'xlsx', 'pdf'].map((format) => <button key={format} className="btn-muted" onClick={() => exportDataset('expense-ledger', format)}><Download size={14} />Ledger {format.toUpperCase()}</button>)}</div>
          <table className="w-full"><thead><tr><th className="table-th">Date</th><th className="table-th">Voucher</th><th className="table-th">Category</th><th className="table-th">Expense</th><th className="table-th">Debit</th><th className="table-th">Credit</th><th className="table-th">Balance</th><th className="table-th">Method</th><th className="table-th">Remarks</th></tr></thead><tbody>{ledger.map((entry) => <tr key={entry._id}><td className="table-td">{dateTime(entry.transactionDate)}</td><td className="table-td">{entry.voucherNo}</td><td className="table-td">{entry.category?.name || '-'}</td><td className="table-td">{entry.expenseName}</td><td className="table-td">{currency(entry.debit)}</td><td className="table-td">{currency(entry.credit)}</td><td className="table-td font-semibold">{currency(entry.balance)}</td><td className="table-td">{entry.paymentMethod}</td><td className="table-td">{entry.remarks || '-'}</td></tr>)}</tbody></table>
        </div>
      )}

      {tab === 'summary' && summary && (
        <div className="space-y-5">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="panel p-4"><small>Total Expense</small><b className="block text-xl">{currency(summary.totalExpense)}</b></div>
            <div className="panel p-4"><small>Today</small><b className="block text-xl">{currency(summary.todaysExpense)}</b></div>
            <div className="panel p-4"><small>This Month</small><b className="block text-xl">{currency(summary.monthlyExpense)}</b></div>
            <div className="panel p-4"><small>Average Daily</small><b className="block text-xl">{currency(summary.averageDailyExpense)}</b></div>
          </div>
          <div className="panel p-5"><h2 className="mb-3 font-semibold">Top Categories</h2>{summary.topExpenseCategories.map((entry) => <div key={entry.category} className="flex justify-between border-b py-2 text-sm"><span>{entry.category}</span><b>{currency(entry.amount)}</b></div>)}</div>
          <div className="flex flex-wrap gap-2">{['csv', 'xlsx', 'pdf'].map((format) => <button key={format} className="btn-muted" onClick={() => exportDataset('expense-summary', format)}><Download size={14} />Summary {format.toUpperCase()}</button>)}{['csv', 'xlsx', 'pdf'].map((format) => <button key={`cat-${format}`} className="btn-muted" onClick={() => exportDataset('expense-category-summary', format)}><Download size={14} />Category {format.toUpperCase()}</button>)}</div>
        </div>
      )}
    </div>
  );
}
