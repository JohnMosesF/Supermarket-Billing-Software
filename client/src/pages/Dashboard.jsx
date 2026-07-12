import {
  AlertTriangle,
  Boxes,
  CreditCard,
  Package,
  RefreshCcw,
  Receipt,
  TrendingUp,
  Users
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '../api/http.js';
import { PageHeader } from '../components/PageHeader.jsx';
import { currency, dateTime } from '../utils/format.js';

function RetailKpi({ icon: Icon, label, value, tone = 'blue', sub }) {
  const tones = {
    blue: 'bg-blue-50 text-blue-700 ring-blue-100 dark:bg-blue-950/40 dark:text-blue-200 dark:ring-blue-900',
    green: 'bg-green-50 text-green-700 ring-green-100 dark:bg-green-950/40 dark:text-green-200 dark:ring-green-900',
    orange: 'bg-orange-50 text-orange-700 ring-orange-100 dark:bg-orange-950/40 dark:text-orange-200 dark:ring-orange-900',
    red: 'bg-red-50 text-red-700 ring-red-100 dark:bg-red-950/40 dark:text-red-200 dark:ring-red-900',
    slate: 'bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700'
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-black text-slate-950 dark:text-white">{value}</p>
          {sub ? <p className="mt-1 text-xs text-slate-500">{sub}</p> : null}
        </div>
        <div className={`flex h-11 w-11 items-center justify-center rounded-xl ring-1 ${tones[tone]}`}>
          <Icon size={21} />
        </div>
      </div>
    </div>
  );
}

export function Dashboard() {
  const [data, setData] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [chartMode, setChartMode] = useState('daily');
  const [lastUpdated, setLastUpdated] = useState(null);

  const loadDashboard = async () => {
    setLoading(true);
    try {
      const [dashboardRes, customerRes] = await Promise.all([
        api.get('/dashboard'),
        api.get('/customers', { silent: true }).catch(() => ({ data: { customers: [] } }))
      ]);
      setData(dashboardRes.data);
      setCustomers(customerRes.data.customers || []);
      setLastUpdated(new Date());
    } catch (error) {
      console.error('Dashboard load failed', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
    const timer = setInterval(loadDashboard, 15000);
    return () => clearInterval(timer);
  }, []);

  const totals = data?.totals || {};
  const recent = data?.recentTransactions || [];
  const pendingCredit = recent.filter((sale) => sale.paymentStatus === 'pending' || sale.paymentMethod === 'credit');
  const monthlySales = useMemo(() => totals.monthlySales ?? (data?.revenueChart || []).reduce((sum, item) => sum + Number(item.revenue || 0), 0), [data, totals.monthlySales]);

  const chartData = useMemo(() => {
    const source = data?.revenueChart || [];
    if (chartMode === 'weekly') {
      const weeks = new Map();
      source.forEach((item) => {
        const week = Math.ceil(Number(item.day || 1) / 7);
        const current = weeks.get(week) || { day: `W${week}`, revenue: 0, profit: 0 };
        current.revenue += Number(item.revenue || 0);
        current.profit += Number(item.profit || 0);
        weeks.set(week, current);
      });
      return Array.from(weeks.values());
    }
    if (chartMode === 'monthly') {
      return [{ day: 'This month', revenue: monthlySales, profit: source.reduce((sum, item) => sum + Number(item.profit || 0), 0) }];
    }
    return source;
  }, [chartMode, data, monthlySales]);

  return (
    <div className="-m-4 min-h-[calc(100vh-5rem)] bg-slate-100 p-4 text-slate-950 dark:bg-slate-950 dark:text-slate-100 sm:-m-6 sm:p-6">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <PageHeader title="Retail Dashboard" description="Sales performance, inventory risk, credit bills, and latest billing activity." />
        <div className="flex flex-wrap items-center gap-2">
          {lastUpdated ? <span className="text-sm text-slate-500">Updated {dateTime(lastUpdated)}</span> : null}
          <button type="button" className="btn-muted inline-flex items-center gap-2" onClick={loadDashboard} disabled={loading}>
            <RefreshCcw size={16} /> Refresh
          </button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <RetailKpi icon={Receipt} label="Today's Sales" value={currency(totals.todaySales)} sub={`${totals.todayInvoices || 0} invoices`} tone="green" />
        <RetailKpi icon={Receipt} label="Today's Bills" value={totals.todayBills || totals.todayInvoices || 0} sub="Invoices created" tone="blue" />
        <RetailKpi icon={TrendingUp} label="Monthly Sales" value={currency(monthlySales)} sub="Current month" tone="blue" />
        <RetailKpi icon={TrendingUp} label="Monthly Profit" value={currency(totals.monthlyProfit)} sub="Current month" tone="green" />
        <RetailKpi icon={Package} label="Total Products" value={totals.productCount || 0} sub="Active catalog" tone="slate" />
        <RetailKpi icon={AlertTriangle} label="Low Stock Products" value={totals.lowStockCount || 0} sub="Needs attention" tone={totals.lowStockCount ? 'red' : 'green'} />
        <RetailKpi icon={Users} label="Total Customers" value={customers.length} sub="Loaded customer base" tone="orange" />
        <RetailKpi icon={CreditCard} label="Pending Credit Bills" value={pendingCredit.length} sub="From recent bills" tone={pendingCredit.length ? 'red' : 'green'} />
        <RetailKpi icon={CreditCard} label="Customer Outstanding" value={currency(totals.totalOutstandingReceivables)} sub={`${totals.customersWithDue || 0} customers`} tone="red" />
        <RetailKpi icon={CreditCard} label="Supplier Outstanding" value={currency(totals.totalPayables)} sub="Total payables" tone="orange" />
        <RetailKpi icon={TrendingUp} label="Today's Collections" value={currency(totals.todayCollections)} sub={`${totals.todayCollectionCount || 0} receipts`} tone="green" />
        <RetailKpi icon={CreditCard} label="Today's Payments" value={currency(totals.todayPayments)} sub={`${totals.todayPaymentCount || 0} vouchers`} tone="orange" />
        <RetailKpi icon={Receipt} label="Cash Balance" value={currency(totals.cashBalance)} sub="Day-book cash position" tone="blue" />
        <RetailKpi icon={RefreshCcw} label="Monthly Returns" value={currency(totals.monthlyReturns)} sub={`${totals.monthlyReturnCount || 0} returns`} tone="slate" />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <div className="panel p-5"><h2 className="font-black">Recent Receipts</h2>{(data?.recentReceipts || []).map((entry) => <div key={entry._id} className="flex justify-between border-b py-2 text-sm"><span>{entry.receiptNo} · {entry.customer?.name || '-'}</span><b>{currency(entry.amount)}</b></div>)}</div>
        <div className="panel p-5"><h2 className="font-black">Recent Supplier Payments</h2>{(data?.recentSupplierPayments || []).map((entry) => <div key={entry._id} className="flex justify-between border-b py-2 text-sm"><span>{entry.voucherNo} · {entry.supplier?.name || '-'}</span><b>{currency(entry.amount)}</b></div>)}</div>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <div className="panel p-5">
          <h2 className="font-black">Top Selling Products</h2>
          {(data?.topSellingProducts || []).map((item) => <div key={`${item._id}-${item.name}`} className="flex justify-between border-b py-2 text-sm"><span>{item.name || '-'}</span><b>{Number(item.quantity || 0).toFixed(2)} sold</b></div>)}
        </div>
        <div className="panel p-5">
          <h2 className="font-black">Top Customers</h2>
          {(data?.topCustomers || []).map((item) => <div key={`${item._id}-${item.customer}`} className="flex justify-between border-b py-2 text-sm"><span>{item.customer || 'Walk-in'}</span><b>{currency(item.total || 0)}</b></div>)}
        </div>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.75fr)]">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-black">Sales Chart</h2>
              <p className="text-sm text-slate-500">Daily, weekly, and monthly sales visibility.</p>
            </div>
            <div className="inline-flex rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
              {['daily', 'weekly', 'monthly'].map((mode) => (
                <button key={mode} onClick={() => setChartMode(mode)} className={`rounded-md px-3 py-1.5 text-sm font-bold capitalize ${chartMode === mode ? 'bg-white text-blue-700 shadow-sm dark:bg-slate-950 dark:text-blue-300' : 'text-slate-500'}`}>
                  {mode}
                </button>
              ))}
            </div>
          </div>
          <div className="h-[360px]">
            <ResponsiveContainer width="100%" height="100%">
              {chartMode === 'monthly' ? (
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="day" />
                  <YAxis />
                  <Tooltip formatter={(value) => currency(value)} />
                  <Bar dataKey="revenue" fill="#2563eb" radius={[8, 8, 0, 0]} />
                  <Bar dataKey="profit" fill="#16a34a" radius={[8, 8, 0, 0]} />
                </BarChart>
              ) : (
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="retailRevenue" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="5%" stopColor="#2563eb" stopOpacity={0.28} />
                      <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="day" />
                  <YAxis />
                  <Tooltip formatter={(value) => currency(value)} />
                  <Area type="monotone" dataKey="revenue" stroke="#2563eb" strokeWidth={3} fill="url(#retailRevenue)" />
                </AreaChart>
              )}
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-black"><Boxes size={19} />Low Stock Panel</h2>
              <p className="text-sm text-slate-500">Critical items stay visible for quick purchase action.</p>
            </div>
            <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-bold text-red-700">{data?.lowStock?.length || 0} alerts</span>
          </div>
          <div className="max-h-[360px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white text-xs uppercase text-slate-500 dark:bg-slate-900">
                <tr>
                  <th className="border-b border-slate-200 px-3 py-2 text-left dark:border-slate-800">Product Code</th>
                  <th className="border-b border-slate-200 px-3 py-2 text-left dark:border-slate-800">Product Name</th>
                  <th className="border-b border-slate-200 px-3 py-2 text-right dark:border-slate-800">Current</th>
                  <th className="border-b border-slate-200 px-3 py-2 text-right dark:border-slate-800">Minimum</th>
                </tr>
              </thead>
              <tbody>
                {(data?.lowStock || []).map((product) => {
                  const critical = Number(product.stock || 0) <= Math.max(1, Number(product.lowStockThreshold || 0) / 2);
                  return (
                    <tr key={product._id} className={critical ? 'bg-red-50 text-red-900 dark:bg-red-950/30 dark:text-red-100' : 'bg-orange-50 text-orange-900 dark:bg-orange-950/30 dark:text-orange-100'}>
                      <td className="border-b border-white/70 px-3 py-2 font-mono">{product.sku}</td>
                      <td className="border-b border-white/70 px-3 py-2 font-semibold">{product.name}</td>
                      <td className="border-b border-white/70 px-3 py-2 text-right font-black">{product.stock}</td>
                      <td className="border-b border-white/70 px-3 py-2 text-right">{product.lowStockThreshold}</td>
                    </tr>
                  );
                })}
                {!data?.lowStock?.length ? (
                  <tr><td colSpan="4" className="px-3 py-12 text-center text-slate-500">No low stock products.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="mt-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-black">Recent Bills</h2>
            <p className="text-sm text-slate-500">Latest invoices with customer, amount, date, and payment status.</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-800">
              <tr>
                <th className="px-4 py-3 text-left">Invoice Number</th>
                <th className="px-4 py-3 text-left">Customer</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3 text-left">Date</th>
                <th className="px-4 py-3 text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((sale, index) => (
                <tr key={sale._id} className={index % 2 ? 'bg-slate-50/60 dark:bg-slate-950' : ''}>
                  <td className="border-b border-slate-100 px-4 py-3 font-bold text-blue-700 dark:border-slate-800 dark:text-blue-300">{sale.invoiceNumber}</td>
                  <td className="border-b border-slate-100 px-4 py-3 dark:border-slate-800">{sale.customerName || sale.customerMobile || sale.customer?.name || 'Walk-in'}</td>
                  <td className="border-b border-slate-100 px-4 py-3 text-right font-black dark:border-slate-800">{currency(sale.total)}</td>
                  <td className="border-b border-slate-100 px-4 py-3 text-slate-500 dark:border-slate-800">{dateTime(sale.createdAt)}</td>
                  <td className="border-b border-slate-100 px-4 py-3 dark:border-slate-800">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-bold capitalize ${sale.paymentStatus === 'pending' ? 'bg-orange-50 text-orange-700' : 'bg-green-50 text-green-700'}`}>
                      {sale.paymentStatus || 'paid'}
                    </span>
                  </td>
                </tr>
              ))}
              {!recent.length ? (
                <tr><td colSpan="5" className="px-4 py-12 text-center text-slate-500">No bills yet.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
