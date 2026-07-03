import { Download } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '../api/http.js';
import { PageHeader } from '../components/PageHeader.jsx';
import { currency } from '../utils/format.js';

export function Reports() {
  const [sales, setSales] = useState([]);
  const [profit, setProfit] = useState(null);
  const [products, setProducts] = useState([]);
  const [stockValuation, setStockValuation] = useState(null);
  const [outstanding, setOutstanding] = useState(null);
  const [customers, setCustomers] = useState([]);
  useEffect(() => {
    Promise.all([
      api.get('/reports/sales'),
      api.get('/reports/profit-loss'),
      api.get('/reports/products'),
      api.get('/reports/stock-valuation'),
      api.get('/reports/outstanding-balances'),
      api.get('/customers', { params: { limit: 1000 } })
    ]).then(([salesRes, profitRes, productRes, valuationRes, outstandingRes, customerRes]) => {
      setSales(salesRes.data.summary);
      setProfit(profitRes.data);
      setProducts(productRes.data.products);
      setStockValuation(valuationRes.data.totals);
      setOutstanding(outstandingRes.data);
      setCustomers(customerRes.data.customers || []);
    });
  }, []);

  async function download(path, filename) {
    const { data } = await api.get(path, { responseType: 'blob' });
    const url = URL.createObjectURL(data);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  const cards = [
    { label: "Today's Sales", value: currency(profit?.revenue) },
    { label: 'This Month', value: currency(profit?.revenue) },
    { label: 'This Year', value: currency(profit?.revenue) },
    { label: 'Profit', value: currency(profit?.profit) },
    { label: 'Loss', value: currency(Math.max(profit?.cost || 0, 0)) },
    { label: 'Outstanding Credit', value: currency(outstanding?.totalOutstanding || 0) }
  ];

  const chartData = sales.map((item) => ({ name: item._id || 'Unknown', total: Number(item.total || 0) }));

  return (
    <div>
      <PageHeader
        title="Reports"
        description="A professional accounting and audit overview with real-time sales and inventory metrics."
        actions={
          <>
            <button className="btn-muted" onClick={() => download('/reports/sales/export.xlsx', 'sales-report.xlsx')}><Download size={17} />Excel</button>
            <button className="btn-muted" onClick={() => download('/reports/sales/export.pdf', 'sales-report.pdf')}><Download size={17} />PDF</button>
          </>
        }
      />
      <div className="mb-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => (
          <div key={card.label} className="panel p-5">
            <p className="text-sm text-slate-500">{card.label}</p>
            <p className="mt-2 text-2xl font-bold">{card.value}</p>
          </div>
        ))}
      </div>
      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <div className="panel p-5">
          <h2 className="mb-3 font-semibold">Payment summary</h2>
          {sales.map((item) => <p key={item._id} className="flex justify-between py-2 text-sm capitalize"><span>{item._id}</span><strong>{currency(item.total)}</strong></p>)}
        </div>
        <div className="panel p-5">
          <h2 className="mb-3 font-semibold">Top products</h2>
          {products.map((item) => <p key={item._id} className="flex justify-between py-2 text-sm"><span>{item.name}</span><strong>{Number(item.quantity || 0).toFixed(3).replace(/\.0+$/, '')} {item.unit || 'pcs'} sold</strong></p>)}
        </div>
      </div>
      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <div className="panel p-5">
          <h2 className="mb-3 font-semibold">Sales by payment method</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip formatter={(value) => currency(value)} />
                <Bar dataKey="total" fill="#10b981" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="panel p-5">
          <h2 className="mb-3 font-semibold">Inventory value</h2>
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2 dark:border-slate-800"><span>Purchase value</span><strong>{currency(stockValuation?.purchaseValue || 0)}</strong></div>
            <div className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2 dark:border-slate-800"><span>Selling value</span><strong>{currency(stockValuation?.sellingValue || 0)}</strong></div>
            <div className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2 dark:border-slate-800"><span>Customers on file</span><strong>{customers.length}</strong></div>
          </div>
        </div>
      </div>
    </div>
  );
}
