import { Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { api } from '../api/http.js';
import { PageHeader } from '../components/PageHeader.jsx';

export function Suppliers() {
  const [suppliers, setSuppliers] = useState([]);
  const { register, handleSubmit, reset } = useForm();

  async function load() {
    const { data } = await api.get('/suppliers');
    setSuppliers(data.suppliers);
  }

  useEffect(() => { load(); }, []);

  async function save(values) {
    await api.post('/suppliers', values);
    toast.success('Supplier saved');
    reset();
    load();
  }

  return (
    <div>
      <PageHeader title="Suppliers" description="Manage supplier contacts used by purchase entries." />
      <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
        <form className="panel space-y-3 p-5" onSubmit={handleSubmit(save)}>
          <h2 className="font-semibold">Add supplier</h2>
          <input className="input" placeholder="Supplier name" {...register('name', { required: true })} />
          <input className="input" placeholder="Contact person" {...register('contactPerson')} />
          <input className="input" placeholder="Mobile" {...register('mobile')} />
          <input className="input" placeholder="GST number" {...register('gstNumber')} />
          <textarea className="input" placeholder="Address" {...register('address')} />
          <button className="btn-primary w-full"><Plus size={17} />Add</button>
        </form>
        <div className="panel overflow-hidden">
          <table className="w-full">
            <thead><tr><th className="table-th">Supplier</th><th className="table-th">Mobile</th><th className="table-th">GST</th></tr></thead>
            <tbody>
              {suppliers.map((supplier) => (
                <tr key={supplier._id}>
                  <td className="table-td"><strong>{supplier.name}</strong><p className="text-xs text-slate-500">{supplier.contactPerson}</p></td>
                  <td className="table-td">{supplier.mobile || '-'}</td>
                  <td className="table-td">{supplier.gstNumber || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
