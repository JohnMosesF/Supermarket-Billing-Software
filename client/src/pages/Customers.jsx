import { Plus, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { api } from '../api/http.js';
import { PageHeader } from '../components/PageHeader.jsx';
import { currency } from '../utils/format.js';

export function Customers() {
  const [customers, setCustomers] = useState([]);
  const [search, setSearch] = useState('');
  const { register, handleSubmit, reset } = useForm();

  async function load() {
    const { data } = await api.get('/customers', { params: { search } });
    setCustomers(data.customers);
  }

  useEffect(() => {
    const timer = setTimeout(load, 250);
    return () => clearTimeout(timer);
  }, [search]);

  async function save(values) {
    await api.post('/customers', values);
    toast.success('Customer saved');
    reset();
    load();
  }

  return (
    <div>
      <PageHeader title="Customers" description="Customer profiles, purchase history, and loyalty balance." />
      <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
        <form className="panel space-y-3 p-5" onSubmit={handleSubmit(save)}>
          <h2 className="font-semibold">Add customer</h2>
          <input className="input" placeholder="Name" {...register('name', { required: true })} />
          <input className="input" placeholder="Mobile" {...register('mobile', { required: true })} />
          <input className="input" placeholder="Email" {...register('email')} />
          <textarea className="input" placeholder="Address" {...register('address')} />
          <button className="btn-primary w-full"><Plus size={17} />Add</button>
        </form>

        <div className="panel overflow-hidden">
          <div className="flex items-center gap-2 border-b border-slate-100 p-4 dark:border-slate-800">
            <Search size={18} className="text-slate-400" />
            <input className="w-full bg-transparent text-sm outline-none" placeholder="Search customers" value={search} onChange={(event) => setSearch(event.target.value)} />
          </div>
          <table className="w-full">
            <thead>
              <tr><th className="table-th">Customer</th><th className="table-th">Loyalty</th><th className="table-th">Spent</th></tr>
            </thead>
            <tbody>
              {customers.map((customer) => (
                <tr key={customer._id}>
                  <td className="table-td"><strong>{customer.name}</strong><p className="text-xs text-slate-500">{customer.mobile}</p></td>
                  <td className="table-td">{customer.loyaltyPoints}</td>
                  <td className="table-td">{currency(customer.totalSpent)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
