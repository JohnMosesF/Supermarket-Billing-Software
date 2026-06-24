import { Edit2, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { api } from '../api/http.js';
import { PageHeader } from '../components/PageHeader.jsx';

export function Suppliers() {
  const [suppliers, setSuppliers] = useState([]);
  const [editing, setEditing] = useState(null);
  const { register, handleSubmit, reset } = useForm();

  async function load() {
    const { data } = await api.get('/suppliers');
    setSuppliers(data.suppliers);
  }

  useEffect(() => { load(); }, []);

  async function save(values) {
    if (editing) {
      await api.patch(`/suppliers/${editing._id}`, values);
      toast.success('Supplier updated');
    } else {
      await api.post('/suppliers', values);
      toast.success('Supplier saved');
    }
    setEditing(null);
    reset();
    load();
  }

  function editSupplier(supplier) {
    setEditing(supplier);
    reset({
      name: supplier.name || '',
      contactPerson: supplier.contactPerson || '',
      mobile: supplier.mobile || '',
      email: supplier.email || '',
      gstNumber: supplier.gstNumber || '',
      address: supplier.address || '',
      notes: supplier.notes || ''
    });
  }

  return (
    <div>
      <PageHeader title="Suppliers" description="Manage supplier contacts used by purchase entries." />
      <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
        <form className="panel space-y-3 p-5" onSubmit={handleSubmit(save)}>
          <h2 className="font-semibold">{editing ? 'Edit supplier' : 'Add supplier'}</h2>
          <input className="input" placeholder="Supplier name" {...register('name', { required: true })} />
          <input className="input" placeholder="Contact person" {...register('contactPerson')} />
          <input className="input" placeholder="Mobile" {...register('mobile')} />
          <input className="input" placeholder="Email" {...register('email')} />
          <input className="input" placeholder="GST number" {...register('gstNumber')} />
          <textarea className="input" placeholder="Address" {...register('address')} />
          <textarea className="input" placeholder="Notes" {...register('notes')} />
          <div className="flex gap-2">
            <button className="btn-primary flex-1"><Plus size={17} />{editing ? 'Update' : 'Add'}</button>
            {editing ? (
              <button type="button" className="btn-muted" onClick={() => { setEditing(null); reset(); }}>Cancel</button>
            ) : null}
          </div>
        </form>
        <div className="panel overflow-hidden">
          <table className="w-full">
            <thead><tr><th className="table-th">Supplier</th><th className="table-th">Mobile</th><th className="table-th">Email</th><th className="table-th">GST</th><th className="table-th"></th></tr></thead>
            <tbody>
              {suppliers.map((supplier) => (
                <tr key={supplier._id}>
                  <td className="table-td"><strong>{supplier.name}</strong><p className="text-xs text-slate-500">{supplier.contactPerson}</p></td>
                  <td className="table-td">{supplier.mobile || '-'}</td>
                  <td className="table-td">{supplier.email || '-'}</td>
                  <td className="table-td">{supplier.gstNumber || '-'}</td>
                  <td className="table-td text-right">
                    <button className="btn-muted h-9 w-9 p-0" onClick={() => editSupplier(supplier)} title="Edit supplier">
                      <Edit2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
