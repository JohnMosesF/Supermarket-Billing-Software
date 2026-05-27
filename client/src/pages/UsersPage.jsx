import { Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { api } from '../api/http.js';
import { PageHeader } from '../components/PageHeader.jsx';

export function UsersPage() {
  const [users, setUsers] = useState([]);
  const { register, handleSubmit, reset } = useForm({ defaultValues: { role: 'cashier' } });

  async function load() {
    const { data } = await api.get('/users');
    setUsers(data.users);
  }

  useEffect(() => { load(); }, []);

  async function save(values) {
    await api.post('/users', values);
    toast.success('Staff account created');
    reset({ role: 'cashier' });
    load();
  }

  return (
    <div>
      <PageHeader title="Users" description="Create staff accounts and assign role-based access." />
      <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
        <form className="panel space-y-3 p-5" onSubmit={handleSubmit(save)}>
          <input className="input" placeholder="Name" {...register('name', { required: true })} />
          <input className="input" type="email" placeholder="Email" {...register('email', { required: true })} />
          <input className="input" type="password" placeholder="Password" {...register('password', { required: true })} />
          <select className="input" {...register('role')}>
            <option value="cashier">Cashier</option>
            <option value="manager">Manager</option>
            <option value="admin">Admin</option>
          </select>
          <button className="btn-primary w-full"><Plus size={17} />Create user</button>
        </form>
        <div className="panel overflow-hidden">
          <table className="w-full">
            <thead><tr><th className="table-th">Name</th><th className="table-th">Email</th><th className="table-th">Role</th><th className="table-th">Status</th></tr></thead>
            <tbody>
              {users.map((user) => (
                <tr key={user._id}>
                  <td className="table-td font-semibold">{user.name}</td>
                  <td className="table-td">{user.email}</td>
                  <td className="table-td capitalize">{user.role}</td>
                  <td className="table-td">{user.active ? 'Active' : 'Inactive'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
