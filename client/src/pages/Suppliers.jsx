import { ArchiveRestore, Edit2, Plus, Search, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { api } from '../api/http.js';
import { ConfirmDialog } from '../components/AppDialog.jsx';
import { PageHeader } from '../components/PageHeader.jsx';

export function Suppliers() {
  const [suppliers, setSuppliers] = useState([]);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);
  const [showDeleted, setShowDeleted] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [permanentDeleteTarget, setPermanentDeleteTarget] = useState(null);
  const { register, handleSubmit, reset } = useForm();

  async function load() {
    const { data } = await api.get('/suppliers', { params: { showDeleted, search } });
    setSuppliers(data.suppliers);
  }

  useEffect(() => {
    load();
  }, [showDeleted, search]);

  async function save(values) {
    if (editing) {
      await api.patch(`/suppliers/${editing._id}`, values);
      toast.success('Supplier updated');
    } else {
      await api.post('/suppliers', values);
      toast.success('Supplier saved');
    }
    setEditing(null);
    reset({ active: true });
    load();
  }

  async function toggleShowDeleted() {
    setShowDeleted((current) => !current);
  }

  function deleteSupplier(supplier) {
    setDeleteTarget(supplier);
  }

  async function confirmDeleteSupplier() {
    await api.delete(`/suppliers/${deleteTarget._id}`);
    toast.success('Supplier deleted');
    setDeleteTarget(null);
    load();
  }

  async function restoreSupplier(supplier) {
    try {
      await api.patch(`/suppliers/${supplier._id}/restore`);
      toast.success('Supplier restored');
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to restore supplier');
    }
  }

  function permanentlyDeleteSupplier(supplier) {
    setPermanentDeleteTarget(supplier);
  }

  async function confirmPermanentlyDeleteSupplier() {
    await api.delete(`/suppliers/${permanentDeleteTarget._id}`, { params: { permanent: true } });
    toast.success('Supplier permanently deleted');
    setPermanentDeleteTarget(null);
    load();
  }

  function editSupplier(supplier) {
    setEditing(supplier);
    reset({
      supplierId: supplier.supplierId || '',
      name: supplier.name || '',
      contactPerson: supplier.contactPerson || '',
      mobile: supplier.mobile || '',
      alternatePhone: supplier.alternatePhone || '',
      email: supplier.email || '',
      gstNumber: supplier.gstNumber || '',
      panNumber: supplier.panNumber || '',
      address: supplier.address || '',
      city: supplier.city || '',
      state: supplier.state || '',
      pincode: supplier.pincode || '',
      openingBalance: supplier.openingBalance || 0,
      remarks: supplier.remarks || '',
      notes: supplier.notes || '',
      active: supplier.active !== false
    });
  }

  return (
    <div>
      <PageHeader title="Suppliers" description="Manage supplier contacts used by purchase entries." />
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-lg font-semibold">{showDeleted ? 'Deleted Suppliers' : 'Active Suppliers'}</h2>
          <p className="text-sm text-slate-500">{showDeleted ? 'Restore or permanently remove deleted supplier records.' : 'Soft delete suppliers from purchase workflows.'}</p>
        </div>
        <button className="btn-muted" type="button" onClick={toggleShowDeleted}>
          {showDeleted ? 'Hide deleted' : 'Show deleted'}
        </button>
      </div>
      <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
        <form className="panel space-y-3 p-5" onSubmit={handleSubmit(save)}>
          <h2 className="font-semibold">{editing ? 'Edit supplier' : 'Add supplier'}</h2>
          <input className="input" placeholder="Supplier ID (auto if blank)" {...register('supplierId')} />
          <input className="input" placeholder="Supplier name" {...register('name', { required: true })} />
          <input className="input" placeholder="Contact person" {...register('contactPerson')} />
          <input className="input" placeholder="Mobile" {...register('mobile')} />
          <input className="input" placeholder="Alternative Phone" {...register('alternatePhone')} />
          <input className="input" placeholder="Email" {...register('email')} />
          <input className="input" placeholder="GST number" {...register('gstNumber')} />
          <input className="input" placeholder="PAN number" {...register('panNumber')} />
          <textarea className="input" placeholder="Address" {...register('address')} />
          <div className="grid grid-cols-3 gap-3">
            <input className="input" placeholder="City" {...register('city')} />
            <input className="input" placeholder="State" {...register('state')} />
            <input className="input" placeholder="Pincode" {...register('pincode')} />
          </div>
          <input className="input" type="number" step="0.01" placeholder="Opening Balance" {...register('openingBalance')} />
          <textarea className="input" placeholder="Remarks" {...register('remarks')} />
          <textarea className="input" placeholder="Notes" {...register('notes')} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" {...register('active')} defaultChecked />
            Active
          </label>
          <div className="flex gap-2">
            <button className="btn-primary flex-1"><Plus size={17} />{editing ? 'Update' : 'Add'}</button>
            {editing ? (
              <button type="button" className="btn-muted" onClick={() => { setEditing(null); reset({ active: true }); }}>Cancel</button>
            ) : null}
          </div>
        </form>
        <div className="scroll-panel">
          <div className="flex items-center gap-2 border-b border-slate-100 p-4 dark:border-slate-800">
            <Search size={18} className="text-slate-400" />
            <input className="w-full bg-transparent text-sm outline-none" placeholder="Search supplier, phone, or GST" value={search} onChange={(event) => setSearch(event.target.value)} />
          </div>
          <table className="w-full">
            <thead><tr><th className="table-th">Supplier</th><th className="table-th">ID</th><th className="table-th">Mobile</th><th className="table-th">Email</th><th className="table-th">GST</th><th className="table-th"></th></tr></thead>
            <tbody>
              {suppliers.map((supplier) => (
                <tr key={supplier._id}>
                  <td className="table-td"><strong>{supplier.name}</strong><p className="text-xs text-slate-500">{supplier.contactPerson}</p></td>
                  <td className="table-td">{supplier.supplierId || '-'}</td>
                  <td className="table-td">{supplier.mobile || '-'}</td>
                  <td className="table-td">{supplier.email || '-'}</td>
                  <td className="table-td">{supplier.gstNumber || '-'}</td>
                  <td className="table-td">
                  <div className="flex items-center justify-center gap-2 min-w-[96px]">
                    <button
                      type="button"
                      className="h-9 w-9 rounded-lg border border-blue-200 bg-blue-50 text-blue-600 hover:bg-blue-100 hover:border-blue-300 transition flex items-center justify-center"
                      onClick={() => editSupplier(supplier)}
                      title="Edit supplier"
                    >
                      <Edit2 size={15} />
                    </button>

                    {supplier.active ? (
                      <button
                        type="button"
                        onClick={() => deleteSupplier(supplier)}
                        title="Delete supplier"
                        className="flex h-9 w-9 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 hover:border-red-300 transition"
                      >
                        <Trash2 size={15} />
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="btn-primary h-9 w-9 p-0 flex items-center justify-center"
                          onClick={() => restoreSupplier(supplier)}
                          title="Restore supplier"
                        >
                          <ArchiveRestore size={15} />
                        </button>

                        <button
                          type="button"
                          className="btn-danger h-9 w-9 p-0 flex items-center justify-center"
                          onClick={() => permanentlyDeleteSupplier(supplier)}
                          title="Permanently delete supplier"
                        >
                          <Trash2 size={15} />
                        </button>
                      </>
                    )}
                  </div>
                </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete Supplier"
        message={`Are you sure you want to delete supplier "${deleteTarget?.name || ''}"?`}
        confirmLabel="Delete"
        danger
        onCancel={() => setDeleteTarget(null)}
        onConfirm={confirmDeleteSupplier}
      />
      <ConfirmDialog
        open={Boolean(permanentDeleteTarget)}
        title="Permanently Delete Supplier"
        message={`Permanently delete supplier "${permanentDeleteTarget?.name || ''}"? This cannot be undone.`}
        confirmLabel="Delete Permanently"
        danger
        onCancel={() => setPermanentDeleteTarget(null)}
        onConfirm={confirmPermanentlyDeleteSupplier}
      />
    </div>
  );
}

