import { AlertTriangle, Package, Receipt, TrendingUp } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '../api/http.js';
import { PageHeader } from '../components/PageHeader.jsx';
import { StatCard } from '../components/StatCard.jsx';
import { currency, dateTime } from '../utils/format.js';

export function Dashboard() {
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get('/dashboard').then((res) => setData(res.data));
  }, []);

  const totals = data?.totals || {};

  return (
    <div>
      <PageHeader title="Dashboard" description="Live sales, stock alerts, and recent billing activity." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={TrendingUp} label="Total sales" value={currency(totals.allSales)} />
        <StatCard icon={Receipt} label="Today sales" value={currency(totals.todaySales)} accent="bg-amber-50 text-amber-700" />
        <StatCard icon={Package} label="Products" value={totals.productCount || 0} accent="bg-blue-50 text-blue-700" />
        <StatCard icon={AlertTriangle} label="Low stock" value={totals.lowStockCount || 0} accent="bg-red-50 text-red-700" />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1fr_380px]">
        <div className="panel p-5">
          <h2 className="mb-4 font-semibold">Monthly revenue</h2>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data?.revenueChart || []}>
                <defs>
                  <linearGradient id="revenue" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="5%" stopColor="#0f8b62" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#0f8b62" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="day" />
                <YAxis />
                <Tooltip formatter={(value) => currency(value)} />
                <Area type="monotone" dataKey="revenue" stroke="#0f8b62" fill="url(#revenue)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="space-y-5">
          <div className="panel p-5">
            <h2 className="mb-3 font-semibold">Low stock alerts</h2>
            <div className="space-y-3">
              {(data?.lowStock || []).map((product) => (
                <div key={product._id} className="flex items-center justify-between rounded-md bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/30 dark:text-red-200">
                  <span>{product.name}</span>
                  <strong>{product.stock}</strong>
                </div>
              ))}
              {!data?.lowStock?.length ? <p className="text-sm text-slate-500">No low stock items.</p> : null}
            </div>
          </div>

          <div className="panel p-5">
            <h2 className="mb-3 font-semibold">Recent transactions</h2>
            <div className="space-y-3">
              {(data?.recentTransactions || []).map((sale) => (
                <div key={sale._id} className="flex items-center justify-between text-sm">
                  <div>
                    <p className="font-medium">{sale.invoiceNumber}</p>
                    <p className="text-xs text-slate-500">{dateTime(sale.createdAt)}</p>
                  </div>
                  <strong>{currency(sale.total)}</strong>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
