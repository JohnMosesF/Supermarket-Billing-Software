import { Edit2, Plus, Search, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { api } from '../api/http.js';
import { PageHeader } from '../components/PageHeader.jsx';
import { currency } from '../utils/format.js';

export function Customers() {
  const [customers, setCustomers] = useState([]);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);
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
    const payload = { ...values, loyaltyPoints: Number(values.loyaltyPoints || 0) };
    if (editing) {
      await api.patch(`/customers/${editing._id}`, payload);
      toast.success('Customer updated');
    } else {
      await api.post('/customers', payload);
      toast.success('Customer saved');
    }
    setEditing(null);
    reset({ name: '', mobile: '', email: '', address: '', gstNumber: '', loyaltyPoints: 0, notes: '' });
    load();
  }

  function startEdit(customer) {
    setEditing(customer);
    reset({
      name: customer.name || '',
      mobile: customer.mobile || '',
      email: customer.email || '',
      address: customer.address || '',
      gstNumber: customer.gstNumber || '',
      loyaltyPoints: customer.loyaltyPoints || 0,
      notes: customer.notes || ''
    });
  }

  async function removeCustomer(customer) {
    if (!window.confirm(`Soft delete ${customer.name}?`)) return;
    await api.delete(`/customers/${customer._id}`);
    toast.success('Customer archived');
    load();
  }

  return (
    <div>
      <PageHeader title="Customers" description="Maintain customer records, loyalty balance, and billing context with a compact management view." />
      <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
        <form className="panel space-y-3 p-5" onSubmit={handleSubmit(save)}>
          <h2 className="font-semibold">{editing ? 'Edit customer' : 'Add customer'}</h2>
          <input className="input" placeholder="Name" {...register('name', { required: true })} />
          <input className="input" placeholder="Mobile" {...register('mobile', { required: true })} />
          <input className="input" placeholder="Email" {...register('email')} />
          <textarea className="input" placeholder="Address" {...register('address')} />
          <input className="input" placeholder="GST Number" {...register('gstNumber')} />
          <input className="input" type="number" placeholder="Loyalty points" {...register('loyaltyPoints')} />
          <textarea className="input" placeholder="Notes" {...register('notes')} />
          <div className="flex gap-2">
            <button className="btn-primary flex-1"><Plus size={17} />{editing ? 'Update' : 'Add'}</button>
            {editing ? <button type="button" className="btn-muted" onClick={() => { setEditing(null); reset({ name: '', mobile: '', email: '', address: '', gstNumber: '', loyaltyPoints: 0, notes: '' }); }}>Cancel</button> : null}
          </div>
        </form>

        <div className="scroll-panel">
          <div className="flex items-center gap-2 border-b border-slate-100 p-4 dark:border-slate-800">
            <Search size={18} className="text-slate-400" />
            <input className="w-full bg-transparent text-sm outline-none" placeholder="Search customers" value={search} onChange={(event) => setSearch(event.target.value)} />
          </div>
          <div className="table-shell">
            <table className="w-full table-sticky">
              <thead>
                <tr><th className="table-th">Customer</th><th className="table-th">Mobile</th><th className="table-th">GST</th><th className="table-th">Loyalty</th><th className="table-th">Spent</th><th className="table-th"></th></tr>
              </thead>
              <tbody>
                {customers.map((customer) => (
                  <tr key={customer._id}>
                    <td className="table-td"><strong>{customer.name}</strong><p className="text-xs text-slate-500">{customer.email || '-'}</p></td>
                    <td className="table-td">{customer.mobile}</td>
                    <td className="table-td">{customer.gstNumber || '-'}</td>
                    <td className="table-td">{customer.loyaltyPoints || 0}</td>
                    <td className="table-td">{currency(customer.totalSpent || 0)}</td>
                    <td className="table-td text-right">
                      <div className="flex justify-end gap-2">
                        <button className="btn-muted h-9 w-9 p-0" onClick={() => startEdit(customer)} title="Edit"><Edit2 size={15} /></button>
                        <button className="btn-muted h-9 w-9 p-0" onClick={() => removeCustomer(customer)} title="Delete"><Trash2 size={15} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
