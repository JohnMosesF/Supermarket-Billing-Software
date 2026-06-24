import { Download } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../api/http.js';
import { PageHeader } from '../components/PageHeader.jsx';
import { currency } from '../utils/format.js';

export function Reports() {
  const [sales, setSales] = useState([]);
  const [profit, setProfit] = useState(null);
  const [products, setProducts] = useState([]);
  useEffect(() => {
    Promise.all([
      api.get('/reports/sales'),
      api.get('/reports/profit-loss'),
      api.get('/reports/products')
    ]).then(([salesRes, profitRes, productRes]) => {
      setSales(salesRes.data.summary);
      setProfit(profitRes.data);
      setProducts(productRes.data.products);
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

  return (
    <div>
      <PageHeader
        title="Reports"
        description="Daily and monthly sales, profit/loss, stock valuation, and product analytics."
        actions={
          <>
            <button className="btn-muted" onClick={() => download('/reports/sales/export.xlsx', 'sales-report.xlsx')}><Download size={17} />Excel</button>
            <button className="btn-muted" onClick={() => download('/reports/sales/export.pdf', 'sales-report.pdf')}><Download size={17} />PDF</button>
          </>
        }
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="panel p-5"><p className="text-sm text-slate-500">Revenue</p><p className="text-2xl font-bold">{currency(profit?.revenue)}</p></div>
        <div className="panel p-5"><p className="text-sm text-slate-500">Profit</p><p className="text-2xl font-bold">{currency(profit?.profit)}</p></div>
        <div className="panel p-5"><p className="text-sm text-slate-500">Invoices</p><p className="text-2xl font-bold">{profit?.invoices || 0}</p></div>
      </div>
      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <div className="panel p-5">
          <h2 className="mb-3 font-semibold">Payment summary</h2>
          {sales.map((item) => <p key={item._id} className="flex justify-between py-2 text-sm capitalize"><span>{item._id}</span><strong>{currency(item.total)}</strong></p>)}
        </div>
        <div className="panel p-5">
          <h2 className="mb-3 font-semibold">Top products</h2>
          {products.map((item) => <p key={item._id} className="flex justify-between py-2 text-sm"><span>{item.name}</span><strong>{Number(item.quantity || 0).toFixed(3).replace(/\.?0+$/, '')} {item.unit || 'pcs'} sold</strong></p>)}
        </div>
      </div>
    </div>
  );
}
