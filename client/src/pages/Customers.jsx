import { Edit2, Plus, RefreshCw, Search, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { api } from '../api/http.js';
import { PageHeader } from '../components/PageHeader.jsx';
import { currency } from '../utils/format.js';

const customerDefaults = { customerId: '', name: '', mobile: '', alternatePhone: '', email: '', gstNumber: '', panNumber: '', address: '', city: '', state: '', pincode: '', openingBalance: 0, creditLimit: 0, remarks: '', loyaltyPoints: 0, notes: '', active: true };
const customerFields = new Set(Object.keys(customerDefaults));

function errorField(detail) {
  const field = detail?.path || detail?.param || detail?.field;
  return customerFields.has(field) ? field : null;
}

export function Customers() {
  const [customers, setCustomers] = useState([]);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const { register, handleSubmit, reset, setError, setFocus, clearErrors, formState: { errors } } = useForm();
  const fieldClass = (name) => errors[name] ? 'input border-red-500 focus:border-red-500 focus:ring-red-100 dark:focus:ring-red-900/40' : 'input';

  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      const { data } = await api.get('/customers', { params: { search } });
      setCustomers(Array.isArray(data?.customers) ? data.customers : []);
    } catch (error) {
      console.error('Unable to load customers', error);
      setCustomers([]);
      setLoadError({
        status: error.response?.status,
        message: error.response?.status === 403 ? 'Access denied. You do not have permission to view customers.' : 'Unable to load customers.'
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = setTimeout(load, 250);
    return () => clearTimeout(timer);
  }, [search]);

  async function save(values) {
    clearErrors();
    const payload = { ...values, loyaltyPoints: Number(values.loyaltyPoints || 0) };
    try {
      if (editing) {
        await api.patch(`/customers/${editing._id}`, payload);
        toast.success('Customer updated');
      } else {
        await api.post('/customers', payload);
        toast.success('Customer saved');
      }
      setEditing(null);
      reset(customerDefaults);
      await load();
    } catch (error) {
      const details = error.response?.data?.details || [];
      const firstField = details.map(errorField).find(Boolean);
      details.forEach((detail) => {
        const field = errorField(detail);
        if (field) setError(field, { type: 'server', message: detail.msg || error.response?.data?.message || 'Invalid value' });
      });
      if (firstField) setTimeout(() => setFocus(firstField), 0);
      if (!firstField) toast.error(error.response?.data?.message || 'Failed to save customer');
    }
  }

  function handleInvalid(formErrors) {
    const firstField = Object.keys(formErrors)[0];
    const message = formErrors[firstField]?.message || 'Validation failed';
    toast.error(message);
    if (firstField) setTimeout(() => setFocus(firstField), 0);
  }

  function startEdit(customer) {
    setEditing(customer);
    reset({
      customerId: customer.customerId || '',
      name: customer.name || '',
      mobile: customer.mobile || '',
      alternatePhone: customer.alternatePhone || '',
      email: customer.email || '',
      address: customer.address || '',
      city: customer.city || '',
      state: customer.state || '',
      pincode: customer.pincode || '',
      gstNumber: customer.gstNumber || '',
      panNumber: customer.panNumber || '',
      openingBalance: customer.openingBalance || 0,
      creditLimit: customer.creditLimit || 0,
      remarks: customer.remarks || '',
      loyaltyPoints: customer.loyaltyPoints || 0,
      notes: customer.notes || '',
      active: customer.active !== false
    });
  }

  async function removeCustomer(customer) {
    if (!window.confirm(`Soft delete ${customer.name}?`)) return;
    try {
      await api.delete(`/customers/${customer._id}`);
      toast.success('Customer archived');
      await load();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to archive customer');
    }
  }

  return (
    <div>
      <PageHeader title="Customers" description="Maintain customer records, loyalty balance, and billing context with a compact management view." actions={<button className="btn-muted" onClick={load} disabled={loading}><RefreshCw size={16} /> {loading ? 'Refreshing...' : 'Refresh'}</button>} />
      {loadError ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
          <p className="font-semibold">{loadError.message}</p>
          {loadError.status !== 403 ? <button className="btn-muted mt-3" onClick={load}>Retry</button> : null}
        </div>
      ) : null}
      <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
        <form className="panel space-y-3 p-5" onSubmit={handleSubmit(save, handleInvalid)}>
          <h2 className="font-semibold">{editing ? 'Edit customer' : 'Add customer'}</h2>
          <input className={fieldClass('customerId')} placeholder="Customer ID (auto if blank)" {...register('customerId')} />
          <input className={fieldClass('name')} placeholder="Name" {...register('name', { required: 'Customer name is required.' })} />
          <input className={fieldClass('mobile')} placeholder="Mobile" {...register('mobile', { required: 'Mobile number is required.' })} />
          <input className={fieldClass('alternatePhone')} placeholder="Alternative Phone" {...register('alternatePhone')} />
          <input className={fieldClass('email')} placeholder="Email" {...register('email')} />
          <input className={fieldClass('gstNumber')} placeholder="GST Number" {...register('gstNumber')} />
          <input className={fieldClass('panNumber')} placeholder="PAN Number" {...register('panNumber')} />
          <textarea className={fieldClass('address')} placeholder="Address" {...register('address')} />
          <div className="grid grid-cols-3 gap-3">
            <input className={fieldClass('city')} placeholder="City" {...register('city')} />
            <input className={fieldClass('state')} placeholder="State" {...register('state')} />
            <input className={fieldClass('pincode')} placeholder="Pincode" {...register('pincode')} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <input className={fieldClass('openingBalance')} type="number" step="0.01" placeholder="Opening Balance" {...register('openingBalance')} />
            <input className={fieldClass('creditLimit')} type="number" step="0.01" placeholder="Credit Limit" {...register('creditLimit')} />
          </div>
          <input className={fieldClass('loyaltyPoints')} type="number" placeholder="Loyalty points" {...register('loyaltyPoints')} />
          <textarea className={fieldClass('remarks')} placeholder="Remarks" {...register('remarks')} />
          <textarea className={fieldClass('notes')} placeholder="Notes" {...register('notes')} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" {...register('active')} defaultChecked />
            Active
          </label>
          <div className="flex gap-2">
            <button className="btn-primary flex-1"><Plus size={17} />{editing ? 'Update' : 'Add'}</button>
            {editing ? <button type="button" className="btn-muted" onClick={() => { setEditing(null); clearErrors(); reset(customerDefaults); }}>Cancel</button> : null}
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
                <tr><th className="table-th">Customer</th><th className="table-th">ID</th><th className="table-th">Mobile</th><th className="table-th">GST</th><th className="table-th">Opening</th><th className="table-th">Credit Limit</th><th className="table-th">Spent</th><th className="table-th">Status</th><th className="table-th"></th></tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td className="table-td py-10 text-center text-slate-500" colSpan={9}>Loading customers...</td></tr>
                ) : !loadError && customers.length === 0 ? (
                  <tr><td className="table-td py-10 text-center text-slate-500" colSpan={9}>No customers found.</td></tr>
                ) : customers.map((customer) => (
                  <tr key={customer._id}>
                    <td className="table-td"><strong>{customer.name}</strong><p className="text-xs text-slate-500">{customer.email || '-'}</p></td>
                    <td className="table-td">{customer.customerId || '-'}</td>
                    <td className="table-td">{customer.mobile}</td>
                    <td className="table-td">{customer.gstNumber || '-'}</td>
                    <td className="table-td">{currency(customer.openingBalance || 0)}</td>
                    <td className="table-td">{currency(customer.creditLimit || 0)}</td>
                    <td className="table-td">{currency(customer.totalSpent || 0)}</td>
                    <td className="table-td">{customer.active === false ? 'Inactive' : 'Active'}</td>
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
