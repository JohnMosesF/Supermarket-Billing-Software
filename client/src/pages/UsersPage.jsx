import { Edit2, Plus, Search, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { api } from '../api/http.js';
import { PageHeader } from '../components/PageHeader.jsx';

export function UsersPage() {
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [editing, setEditing] = useState(null);
  const { register, handleSubmit, reset } = useForm({ defaultValues: { role: 'cashier' } });

  async function load() {
    const { data } = await api.get('/users');
    setUsers(data.users);
  }

  useEffect(() => { load(); }, []);

  async function save(values) {
    const payload = { ...values };
    if (!payload.password) delete payload.password;
    if (editing) {
      await api.patch(`/users/${editing._id}`, payload);
      toast.success('User updated');
    } else {
      await api.post('/users', payload);
      toast.success('Staff account created');
    }
    setEditing(null);
    reset({ role: 'cashier', password: '' });
    load();
  }

  function startEdit(user) {
    setEditing(user);
    reset({ name: user.name || '', email: user.email || '', phone: user.phone || '', role: user.role || 'cashier', password: '', active: user.active !== false });
  }

  async function toggleUser(user) {
    await api.patch(`/users/${user._id}`, { active: !user.active });
    toast.success('User status updated');
    load();
  }

  async function resetPassword(user) {
    const nextPassword = window.prompt(`Set a new password for ${user.name}`);
    if (!nextPassword) return;
    await api.patch(`/users/${user._id}`, { password: nextPassword });
    toast.success('Password updated');
  }

  async function removeUser(user) {
    if (!window.confirm(`Soft delete ${user.name}?`)) return;
    await api.delete(`/users/${user._id}`);
    toast.success('User archived');
    load();
  }

  const filteredUsers = users.filter((user) => {
    const matchesSearch = [user.name, user.email, user.phone].join(' ').toLowerCase().includes(search.toLowerCase());
    const matchesRole = filterRole === 'all' || user.role === filterRole;
    const matchesStatus = filterStatus === 'all' || String(user.active) === filterStatus;
    return matchesSearch && matchesRole && matchesStatus;
  });

  return (
    <div>
      <PageHeader title="Users" description="Manage staff accounts, role access, and status in a professional workspace view." />
      <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
        <form className="panel space-y-3 p-5" onSubmit={handleSubmit(save)}>
          <h2 className="font-semibold">{editing ? 'Edit user' : 'Create user'}</h2>
          <input className="input" placeholder="Name" {...register('name', { required: true })} />
          <input className="input" type="email" placeholder="Email" {...register('email', { required: true })} />
          <input className="input" placeholder="Phone" {...register('phone')} />
          <input className="input" type="password" placeholder={editing ? 'New password (optional)' : 'Password'} {...register('password')} />
          <select className="input" {...register('role')}>
            <option value="cashier">Cashier</option>
            <option value="manager">Manager</option>
            <option value="admin">Admin</option>
          </select>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" {...register('active')} defaultChecked />
            Enable user
          </label>
          <div className="flex gap-2">
            <button className="btn-primary flex-1"><Plus size={17} />{editing ? 'Update' : 'Create'}</button>
            {editing ? <button type="button" className="btn-muted" onClick={() => { setEditing(null); reset({ role: 'cashier', password: '' }); }}>Cancel</button> : null}
          </div>
        </form>
        <div className="scroll-panel">
          <div className="flex flex-col gap-3 border-b border-slate-100 p-4 dark:border-slate-800 md:flex-row md:items-center">
            <div className="flex flex-1 items-center gap-2 rounded-md border border-slate-200 px-3 py-2 dark:border-slate-700">
              <Search size={16} className="text-slate-400" />
              <input className="w-full bg-transparent text-sm outline-none" placeholder="Search users" value={search} onChange={(event) => setSearch(event.target.value)} />
            </div>
            <select className="input max-w-[140px]" value={filterRole} onChange={(event) => setFilterRole(event.target.value)}>
              <option value="all">All roles</option>
              <option value="cashier">Cashier</option>
              <option value="manager">Manager</option>
              <option value="admin">Admin</option>
            </select>
            <select className="input max-w-[140px]" value={filterStatus} onChange={(event) => setFilterStatus(event.target.value)}>
              <option value="all">All status</option>
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select>
          </div>
          <div className="table-shell">
            <table className="w-full table-sticky">
              <thead><tr><th className="table-th">Name</th><th className="table-th">Email</th><th className="table-th">Phone</th><th className="table-th">Role</th><th className="table-th">Status</th><th className="table-th">Created</th><th className="table-th"></th></tr></thead>
              <tbody>
                {filteredUsers.map((user) => (
                  <tr key={user._id}>
                    <td className="table-td font-semibold">{user.name}</td>
                    <td className="table-td">{user.email}</td>
                    <td className="table-td">{user.phone || '-'}</td>
                    <td className="table-td capitalize">{user.role}</td>
                    <td className="table-td">{user.active ? 'Active' : 'Inactive'}</td>
                    <td className="table-td">{new Date(user.createdAt).toLocaleDateString()}</td>
                    <td className="table-td text-right">
                      <div className="flex justify-end gap-2">
                        <button className="h-9 w-9 rounded-lg border border-blue-200 bg-blue-50 text-blue-600 hover:bg-blue-100 hover:border-blue-300 transition flex items-center justify-center" onClick={() => startEdit(user)} title="Edit"><Edit2 size={15} /></button>
                        <button className="btn-muted py-1.5" onClick={() => resetPassword(user)}>Reset</button>
                        <button className="btn-muted py-1.5" onClick={() => toggleUser(user)}>{user.active ? 'Disable' : 'Enable'}</button>
                        <button className="flex h-9 w-9 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 hover:border-red-300 transition" onClick={() => removeUser(user)} title="Delete"><Trash2 size={15} /></button>
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
