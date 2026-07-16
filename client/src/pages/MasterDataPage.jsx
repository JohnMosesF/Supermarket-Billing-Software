import { Edit2, Plus, Search, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { api } from '../api/http.js';
import { PageHeader } from '../components/PageHeader.jsx';

const masters = {
  categories: { title: 'Category Master', endpoint: '/categories', listKey: 'categories', nameLabel: 'Category Name' },
  brands: { title: 'Brand Master', endpoint: '/brands', listKey: 'brands', nameLabel: 'Brand Name' },
  units: { title: 'Unit Master', endpoint: '/units', listKey: 'units', nameLabel: 'Unit Name', unit: true },
  taxes: { title: 'GST Master', endpoint: '/taxes', listKey: 'taxes', nameLabel: 'GST Name', tax: true }
};

export function MasterDataPage({ type }) {
  const config = masters[type] || masters.categories;
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);
  const { register, handleSubmit, reset } = useForm({ defaultValues: { active: true, allowDecimal: false } });

  async function load() {
    const { data } = await api.get(config.endpoint, { params: { search } });
    setItems(data[config.listKey] || []);
  }

  useEffect(() => {
    const timer = setTimeout(load, 200);
    return () => clearTimeout(timer);
  }, [type, search]);

  async function save(values) {
    const payload = {
      ...values,
      active: values.active !== false,
      ...(config.unit ? { allowDecimal: Boolean(values.allowDecimal), name: String(values.name || '').trim().toLowerCase() } : {}),
      ...(config.tax ? { rate: Number(values.rate || 0), name: values.name || `GST ${values.rate}%` } : {})
    };
    if (editing) {
      await api.patch(`${config.endpoint}/${editing._id}`, payload);
      toast.success('Master updated');
    } else {
      await api.post(config.endpoint, payload);
      toast.success('Master created');
    }
    setEditing(null);
    reset({ name: '', description: '', rate: '', active: true, allowDecimal: false });
    load();
  }

  function edit(item) {
    setEditing(item);
    reset({
      name: item.name || '',
      description: item.description || '',
      rate: item.rate ?? item.taxRate ?? '',
      active: item.active !== false,
      allowDecimal: item.allowDecimal || false
    });
  }

  async function remove(item) {
    if (!window.confirm(`Delete ${item.name}?`)) return;
    await api.delete(`${config.endpoint}/${item._id}`);
    toast.success('Master deleted');
    load();
  }

  return (
    <div>
      <PageHeader title={config.title} description="Maintain reusable master data with search, status, validation, and controlled delete." />
      <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
        <form className="panel space-y-3 p-5" onSubmit={handleSubmit(save)}>
          <h2 className="font-semibold">{editing ? 'Edit' : 'Create'}</h2>
          {config.tax ? <input className="input" type="number" placeholder="GST %" {...register('rate', { required: true })} /> : null}
          <input className="input" placeholder={config.nameLabel} {...register('name', { required: !config.tax })} />
          {!config.unit ? <textarea className="input" placeholder="Description" {...register('description')} /> : null}
          {config.unit ? (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" {...register('allowDecimal')} />
              Allow decimal quantity
            </label>
          ) : null}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" {...register('active')} defaultChecked />
            Active
          </label>
          <div className="flex gap-2">
            <button className="btn-primary flex-1"><Plus size={17} />{editing ? 'Update' : 'Add'}</button>
            {editing ? <button type="button" className="btn-muted" onClick={() => { setEditing(null); reset({ active: true }); }}>Cancel</button> : null}
          </div>
        </form>

        <div className="scroll-panel">
          <div className="flex items-center gap-2 border-b border-slate-100 p-4 dark:border-slate-800">
            <Search size={18} className="text-slate-400" />
            <input className="w-full bg-transparent text-sm outline-none" placeholder="Instant search" value={search} onChange={(event) => setSearch(event.target.value)} />
          </div>
          <div className="table-shell">
            <table className="w-full table-sticky">
              <thead>
                <tr>
                  <th className="table-th">Name</th>
                  {config.tax ? <th className="table-th">Rate</th> : null}
                  {config.unit ? <th className="table-th">Decimal</th> : <th className="table-th">Description</th>}
                  <th className="table-th">Status</th>
                  <th className="table-th"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item._id}>
                    <td className="table-td font-semibold">{item.name}</td>
                    {config.tax ? <td className="table-td">{item.rate}%</td> : null}
                    {config.unit ? <td className="table-td">{item.allowDecimal ? 'Yes' : 'No'}</td> : <td className="table-td">{item.description || '-'}</td>}
                    <td className="table-td">{item.active === false ? 'Inactive' : 'Active'}</td>
                    <td className="table-td text-right">
                      <div className="flex justify-end gap-2">
                        <button type="button" className="btn-muted h-9 w-9 p-0" onClick={() => edit(item)} title="Edit"><Edit2 size={15} /></button>
                        <button type="button" className="btn-muted h-9 w-9 p-0" onClick={() => remove(item)} title="Delete"><Trash2 size={15} /></button>
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
