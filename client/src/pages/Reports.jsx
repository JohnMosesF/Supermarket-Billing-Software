import {
  Activity,
  BarChart3,
  CalendarDays,
  Download,
  FileSpreadsheet,
  FileText,
  Package,
  Receipt,
  ShieldCheck,
  ShoppingCart,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import { api } from '../api/http.js';
import { PageHeader } from '../components/PageHeader.jsx';
import { currency, dateTime } from '../utils/format.js';

const FILTERS = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
  { key: 'custom', label: 'Custom Date Range' }
];

const PAYMENT_COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#14b8a6'];

function toInputDate(date) {
  return date.toISOString().slice(0, 10);
}

function startOfDay(date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function endOfDay(date) {
  const copy = new Date(date);
  copy.setHours(23, 59, 59, 999);
  return copy;
}

function getPresetRange(filter) {
  const now = new Date();
  if (filter === 'yesterday') {
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    return { from: startOfDay(yesterday), to: endOfDay(yesterday) };
  }
  if (filter === 'week') {
    const from = startOfDay(now);
    from.setDate(now.getDate() - now.getDay());
    return { from, to: endOfDay(now) };
  }
  if (filter === 'month') {
    return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: endOfDay(now) };
  }
  return { from: startOfDay(now), to: endOfDay(now) };
}

function formatCount(value) {
  return new Intl.NumberFormat('en-IN').format(Number(value || 0));
}

function humanize(value) {
  return String(value || '')
    .replace(/_/g, ' ')
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (char) => char.toUpperCase());
}

function safeList(items) {
  return Array.isArray(items) ? items : [];
}

function MetricTile({ label, value, tone = 'default' }) {
  const toneClass = {
    default: 'text-slate-950 dark:text-white',
    good: 'text-emerald-700 dark:text-emerald-300',
    warn: 'text-amber-700 dark:text-amber-300',
    bad: 'text-rose-700 dark:text-rose-300',
    info: 'text-sky-700 dark:text-sky-300'
  }[tone];

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-950/40">
      <p className="text-xs font-medium uppercase text-slate-500 dark:text-slate-400">{label}</p>
      <p className={`mt-1 break-words text-lg font-bold ${toneClass}`}>{value}</p>
    </div>
  );
}

function Section({ icon: Icon, title, children, className = '' }) {
  return (
    <section className={`panel p-5 ${className}`}>
      <div className="mb-4 flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-md bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
          <Icon size={18} />
        </span>
        <h2 className="font-semibold text-slate-950 dark:text-white">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function MetricsGrid({ metrics }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {metrics.map((metric) => (
        <MetricTile key={metric.label} {...metric} />
      ))}
    </div>
  );
}

function ChartPanel({ title, children }) {
  return (
    <div className="panel p-5">
      <h2 className="mb-4 font-semibold text-slate-950 dark:text-white">{title}</h2>
      <div className="h-72 min-w-0">{children}</div>
    </div>
  );
}

function SimpleTable({ rows, columns, empty = 'No data for selected period.' }) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
      <div className="max-h-80 overflow-auto">
        <table className="min-w-full">
          <thead className="sticky top-0 bg-white dark:bg-slate-900">
            <tr>
              {columns.map((column) => (
                <th key={column.key} className="table-th">{column.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length ? rows.map((row, index) => (
              <tr key={`${row.name || row.customer || row.supplier || row.method || row.dateTime}-${index}`}>
                {columns.map((column) => (
                  <td key={column.key} className="table-td">
                    {column.render ? column.render(row) : row[column.key]}
                  </td>
                ))}
              </tr>
            )) : (
              <tr>
                <td className="table-td text-center text-slate-500" colSpan={columns.length}>{empty}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function Reports() {
  const [filter, setFilter] = useState('today');
  const today = useMemo(() => toInputDate(new Date()), []);
  const [customRange, setCustomRange] = useState({ from: today, to: today });
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);

  const queryParams = useMemo(() => {
    const range = filter === 'custom'
      ? { from: new Date(`${customRange.from}T00:00:00`), to: new Date(`${customRange.to}T23:59:59`) }
      : getPresetRange(filter);
    return {
      from: range.from.toISOString(),
      to: range.to.toISOString()
    };
  }, [customRange.from, customRange.to, filter]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.get('/reports/business-intelligence', { params: queryParams })
      .then((res) => {
        if (!cancelled) setDashboard(res.data);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [queryParams]);

  async function download(format) {
    const params = new URLSearchParams(queryParams).toString();
    const { data } = await api.get(`/reports/business-intelligence/export.${format}?${params}`, { responseType: 'blob' });
    const url = URL.createObjectURL(data);
    const link = document.createElement('a');
    link.href = url;
    link.download = `business-intelligence-dashboard.${format === 'xlsx' ? 'xlsx' : format}`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const sales = dashboard?.sales || {};
  const purchases = dashboard?.purchases || {};
  const inventory = dashboard?.inventory || {};
  const customers = dashboard?.customers || {};
  const suppliers = dashboard?.suppliers || {};
  const returns = dashboard?.returns || {};
  const tax = dashboard?.tax || {};
  const charts = dashboard?.charts || {};

  const headlineCards = [
    { label: 'Net Sales', value: currency(sales.netSales), icon: TrendingUp, tone: 'good' },
    { label: 'Total Profit', value: currency(sales.totalProfit), icon: BarChart3, tone: 'good' },
    { label: 'Purchase Cost', value: currency(purchases.purchaseCost), icon: ShoppingCart, tone: 'info' },
    { label: 'Inventory Value', value: currency(inventory.inventoryPurchaseValue), icon: Package, tone: 'info' },
    { label: 'Customer Outstanding', value: currency(customers.customerOutstanding), icon: Users, tone: 'warn' },
    { label: 'Supplier Outstanding', value: currency(suppliers.supplierOutstanding), icon: Wallet, tone: 'warn' }
  ];

  const salesMetrics = [
    ['Total Sales', currency(sales.totalSales), 'good'],
    ['Net Sales', currency(sales.netSales), 'good'],
    ['Gross Sales', currency(sales.grossSales)],
    ['GST Collected', currency(sales.gstCollected)],
    ['Discounts Given', currency(sales.discountsGiven), 'warn'],
    ['Round Off Total', currency(sales.roundOffTotal)],
    ['Total Profit', currency(sales.totalProfit), 'good'],
    ['Total Loss', currency(sales.totalLoss), 'bad'],
    ['Average Bill Value', currency(sales.averageBillValue)],
    ['Highest Bill', currency(sales.highestBill), 'good'],
    ['Lowest Bill', currency(sales.lowestBill)],
    ['Number of Bills', formatCount(sales.numberOfBills), 'info'],
    ['Credit Bills', formatCount(sales.creditBills), 'warn'],
    ['Cash Bills', formatCount(sales.cashBills), 'good']
  ].map(([label, value, tone]) => ({ label, value, tone }));

  const purchaseMetrics = [
    ['Total Purchases', currency(purchases.totalPurchases)],
    ['Purchase GST', currency(purchases.purchaseGst)],
    ['Outstanding Supplier Amount', currency(purchases.outstandingSupplierAmount), 'warn'],
    ['Amount Paid to Suppliers', currency(purchases.amountPaidToSuppliers), 'good'],
    ['Pending Supplier Payments', currency(purchases.pendingSupplierPayments), 'warn'],
    ['Purchase Returns', currency(purchases.purchaseReturns)],
    ['Purchase Cost', currency(purchases.purchaseCost), 'info']
  ].map(([label, value, tone]) => ({ label, value, tone }));

  const inventoryMetrics = [
    ['Inventory Value (Purchase Cost)', currency(inventory.inventoryPurchaseValue), 'info'],
    ['Inventory Value (Selling Price)', currency(inventory.inventorySellingValue), 'good'],
    ['Total Products', formatCount(inventory.totalProducts)],
    ['Out of Stock', formatCount(inventory.outOfStock), 'bad'],
    ['Low Stock', formatCount(inventory.lowStock), 'warn'],
    ['Expiring Soon', formatCount(inventory.expiringSoon), 'warn'],
    ['Expired Products', formatCount(inventory.expiredProducts), 'bad'],
    ['Dead Stock', formatCount(inventory.deadStock), 'warn'],
    ['Fast Moving Products', formatCount(safeList(inventory.fastMovingProducts).length), 'good'],
    ['Slow Moving Products', formatCount(safeList(inventory.slowMovingProducts).length), 'warn']
  ].map(([label, value, tone]) => ({ label, value, tone }));

  const customerMetrics = [
    ['Total Customers', formatCount(customers.totalCustomers)],
    ['New Customers', formatCount(customers.newCustomers), 'good'],
    ['Returning Customers', formatCount(customers.returningCustomers), 'info'],
    ['Customer Outstanding', currency(customers.customerOutstanding), 'warn'],
    ['Total Receipts', currency(customers.totalReceipts), 'good']
  ].map(([label, value, tone]) => ({ label, value, tone }));

  const supplierMetrics = [
    ['Total Suppliers', formatCount(suppliers.totalSuppliers)],
    ['Supplier Outstanding', currency(suppliers.supplierOutstanding), 'warn'],
    ['Supplier Payments', currency(suppliers.supplierPayments), 'good']
  ].map(([label, value, tone]) => ({ label, value, tone }));

  return (
    <div>
      <PageHeader
        title="Reports"
        description="Business intelligence, accounting analytics, inventory movement, payments, tax and audit activity."
        actions={
          <>
            <button className="btn-muted" onClick={() => download('xlsx')}><FileSpreadsheet size={17} />Excel</button>
            <button className="btn-muted" onClick={() => download('pdf')}><FileText size={17} />PDF</button>
            <button className="btn-muted" onClick={() => download('csv')}><Download size={17} />CSV</button>
          </>
        }
      />

      <div className="panel mb-5 p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap gap-2">
            {FILTERS.map((item) => (
              <button
                key={item.key}
                className={filter === item.key ? 'btn-primary' : 'btn-muted'}
                onClick={() => setFilter(item.key)}
              >
                {item.key === 'custom' ? <CalendarDays size={16} /> : null}
                {item.label}
              </button>
            ))}
          </div>
          {filter === 'custom' ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <input className="input" type="date" value={customRange.from} onChange={(event) => setCustomRange((prev) => ({ ...prev, from: event.target.value }))} />
              <input className="input" type="date" value={customRange.to} onChange={(event) => setCustomRange((prev) => ({ ...prev, to: event.target.value }))} />
            </div>
          ) : null}
        </div>
      </div>

      {loading ? (
        <div className="panel p-8 text-center text-sm text-slate-500">Loading dashboard metrics...</div>
      ) : (
        <>
          <div className="mb-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
            {headlineCards.map(({ icon: Icon, label, value, tone }) => (
              <div key={label} className="panel p-4">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-xs font-medium uppercase text-slate-500">{label}</span>
                  <Icon className={tone === 'warn' ? 'text-amber-600' : tone === 'good' ? 'text-emerald-600' : 'text-sky-600'} size={18} />
                </div>
                <p className="break-words text-xl font-bold text-slate-950 dark:text-white">{value}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-5">
            <Section icon={Receipt} title="Sales Analytics">
              <MetricsGrid metrics={salesMetrics} />
            </Section>

            <Section icon={ShoppingCart} title="Purchase Analytics">
              <MetricsGrid metrics={purchaseMetrics} />
            </Section>

            <Section icon={Package} title="Inventory Analytics">
              <MetricsGrid metrics={inventoryMetrics} />
            </Section>

            <div className="grid gap-5 xl:grid-cols-2">
              <Section icon={Users} title="Customer Analytics">
                <MetricsGrid metrics={customerMetrics} />
                <div className="mt-5 grid gap-5 2xl:grid-cols-2">
                  <SimpleTable
                    rows={safeList(customers.topCustomers)}
                    columns={[
                      { key: 'customer', label: 'Top 10 Customers' },
                      { key: 'bills', label: 'Bills', render: (row) => formatCount(row.bills) },
                      { key: 'total', label: 'Amount', render: (row) => currency(row.total) }
                    ]}
                  />
                  <SimpleTable
                    rows={safeList(customers.customerPurchaseFrequency)}
                    columns={[
                      { key: 'customer', label: 'Customer Purchase Frequency' },
                      { key: 'purchases', label: 'Purchases', render: (row) => formatCount(row.purchases) },
                      { key: 'total', label: 'Amount', render: (row) => currency(row.total) }
                    ]}
                  />
                </div>
              </Section>

              <Section icon={Wallet} title="Supplier Analytics">
                <MetricsGrid metrics={supplierMetrics} />
                <div className="mt-5 grid gap-5 2xl:grid-cols-2">
                  <SimpleTable
                    rows={safeList(suppliers.topSuppliers)}
                    columns={[
                      { key: 'supplier', label: 'Top Suppliers' },
                      { key: 'invoices', label: 'Invoices', render: (row) => formatCount(row.invoices) },
                      { key: 'total', label: 'Amount', render: (row) => currency(row.total) }
                    ]}
                  />
                  <SimpleTable
                    rows={safeList(suppliers.purchaseFrequency)}
                    columns={[
                      { key: 'supplier', label: 'Purchase Frequency' },
                      { key: 'purchases', label: 'Purchases', render: (row) => formatCount(row.purchases) },
                      { key: 'total', label: 'Amount', render: (row) => currency(row.total) }
                    ]}
                  />
                </div>
              </Section>
            </div>

            <div className="grid gap-5 xl:grid-cols-3">
              <Section icon={Wallet} title="Payment Analytics" className="xl:col-span-2">
                <SimpleTable
                  rows={safeList(dashboard?.payments)}
                  columns={[
                    { key: 'method', label: 'Method', render: (row) => humanize(row.method) },
                    { key: 'amount', label: 'Amount', render: (row) => currency(row.amount) },
                    { key: 'percentage', label: 'Percentage', render: (row) => `${Number(row.percentage || 0).toFixed(2)}%` },
                    { key: 'bills', label: 'Bills', render: (row) => formatCount(row.bills) }
                  ]}
                />
              </Section>

              <Section icon={TrendingDown} title="Return Analytics">
                <MetricsGrid metrics={[
                  { label: 'Sales Returns', value: currency(returns.salesReturns), tone: 'warn' },
                  { label: 'Purchase Returns', value: currency(returns.purchaseReturns), tone: 'warn' },
                  { label: 'Return Amount', value: currency(returns.returnAmount), tone: 'bad' },
                  { label: 'Return Percentage', value: `${Number(returns.returnPercentage || 0).toFixed(2)}%`, tone: 'warn' }
                ]} />
              </Section>
            </div>

            <Section icon={ShieldCheck} title="Tax Analytics">
              <MetricsGrid metrics={[
                { label: 'CGST', value: currency(tax.cgst) },
                { label: 'SGST', value: currency(tax.sgst) },
                { label: 'IGST', value: currency(tax.igst) },
                { label: 'Taxable Amount', value: currency(tax.taxableAmount), tone: 'info' },
                { label: 'Tax Collected', value: currency(tax.taxCollected), tone: 'good' }
              ]} />
            </Section>

            <Section icon={Package} title="Product Analytics">
              <div className="grid gap-5 xl:grid-cols-2 2xl:grid-cols-3">
                {[
                  ['Top Selling Products', dashboard?.products?.topSelling],
                  ['Least Selling Products', dashboard?.products?.leastSelling],
                  ['Most Profitable Products', dashboard?.products?.mostProfitable],
                  ['Least Profitable Products', dashboard?.products?.leastProfitable],
                  ['Highest Margin Products', dashboard?.products?.highestMargin],
                  ['Lowest Margin Products', dashboard?.products?.lowestMargin]
                ].map(([title, rows]) => (
                  <div key={title}>
                    <h3 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">{title}</h3>
                    <SimpleTable
                      rows={safeList(rows)}
                      columns={[
                        { key: 'name', label: 'Product' },
                        { key: 'quantity', label: 'Qty', render: (row) => `${Number(row.quantity || 0).toFixed(2)} ${row.unit || ''}` },
                        { key: 'profit', label: 'Profit', render: (row) => currency(row.profit) },
                        { key: 'margin', label: 'Margin', render: (row) => `${Number(row.margin || 0).toFixed(1)}%` }
                      ]}
                    />
                  </div>
                ))}
              </div>
            </Section>

            <div className="grid gap-5 xl:grid-cols-2">
              <ChartPanel title="Daily Sales Trend">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={safeList(charts.dailySalesTrend)}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip formatter={(value) => currency(value)} />
                    <Area type="monotone" dataKey="sales" stroke="#10b981" fill="#10b981" fillOpacity={0.18} />
                  </AreaChart>
                </ResponsiveContainer>
              </ChartPanel>

              <ChartPanel title="Monthly Sales Trend">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={safeList(charts.monthlySalesTrend)}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip formatter={(value) => currency(value)} />
                    <Line type="monotone" dataKey="sales" stroke="#3b82f6" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </ChartPanel>

              <ChartPanel title="Payment Method Pie Chart">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={safeList(charts.paymentMethod)} dataKey="value" nameKey="name" outerRadius={92} label>
                      {safeList(charts.paymentMethod).map((entry, index) => <Cell key={entry.name} fill={PAYMENT_COLORS[index % PAYMENT_COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(value) => currency(value)} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </ChartPanel>

              <ChartPanel title="Top Products Bar Chart">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={safeList(charts.topProducts)}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" hide />
                    <YAxis />
                    <Tooltip formatter={(value, name) => (name === 'revenue' ? currency(value) : value)} />
                    <Bar dataKey="quantity" fill="#10b981" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartPanel>

              <ChartPanel title="Monthly Profit Chart">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={safeList(charts.monthlyProfit)}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip formatter={(value) => currency(value)} />
                    <Bar dataKey="profit" fill="#f59e0b" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartPanel>

              <ChartPanel title="Purchase vs Sales Comparison">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={safeList(charts.purchaseVsSales)}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip formatter={(value) => currency(value)} />
                    <Legend />
                    <Bar dataKey="sales" fill="#10b981" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="purchases" fill="#3b82f6" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartPanel>
            </div>

            <Section icon={Activity} title="Audit Panel">
              <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-6">
                {Object.entries(dashboard?.activityCounts || {}).map(([key, value]) => (
                  <MetricTile key={key} label={humanize(key)} value={typeof value === 'number' && value > 999 ? currency(value) : formatCount(value)} />
                ))}
              </div>
              <SimpleTable
                rows={safeList(dashboard?.audit)}
                columns={[
                  { key: 'dateTime', label: 'Date & Time', render: (row) => dateTime(row.dateTime) },
                  { key: 'user', label: 'User' },
                  { key: 'module', label: 'Module' },
                  { key: 'action', label: 'Action', render: (row) => humanize(row.action) },
                  { key: 'referenceNumber', label: 'Reference Number' }
                ]}
              />
            </Section>
          </div>
        </>
      )}
    </div>
  );
}
