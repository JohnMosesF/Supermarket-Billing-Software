import { motion } from 'framer-motion';
import { Lock, Mail, Receipt } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore.js';

export function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const token = useAuthStore((state) => state.token);
  const login = useAuthStore((state) => state.login);
  const [loading, setLoading] = useState(false);
  const { register, handleSubmit } = useForm({
    defaultValues: { email: 'admin@store.com', password: 'Admin@12345' }
  });

  if (token) return <Navigate to="/" replace />;

  async function onSubmit(values) {
    setLoading(true);
    try {
      await login(values);
      toast.success('Welcome back');
      navigate(location.state?.from?.pathname || '/', { replace: true });
    } catch (error) {
      const message = error.response?.data?.message || error.message || 'Unable to sign in';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen bg-slate-950 text-white">
      <div className="hidden flex-1 bg-[url('/src/assets/hero.png')] bg-cover bg-center lg:block" />
      <div className="flex flex-1 items-center justify-center p-6">
        <motion.form
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          onSubmit={handleSubmit(onSubmit)}
          className="w-full max-w-md rounded-lg bg-white p-8 text-slate-950 shadow-2xl"
        >
          <div className="mb-8 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-md bg-leaf text-white">
              <Receipt size={24} />
            </div>
            <div>
              <h1 className="text-2xl font-bold">StoreDesk POS</h1>
              <p className="text-sm text-slate-500">Secure staff login</p>
            </div>
          </div>

          <label className="mb-1 block text-sm font-semibold">Email</label>
          <div className="relative mb-4">
            <Mail className="absolute left-3 top-2.5 text-slate-400" size={18} />
            <input className="input pl-10" type="email" {...register('email', { required: true })} />
          </div>

          <label className="mb-1 block text-sm font-semibold">Password</label>
          <div className="relative mb-6">
            <Lock className="absolute left-3 top-2.5 text-slate-400" size={18} />
            <input className="input pl-10" type="password" {...register('password', { required: true })} />
          </div>

          <button className="btn-primary w-full" disabled={loading}>
            {loading ? 'Signing in...' : 'Login'}
          </button>
          <p className="mt-4 text-center text-xs text-slate-500">Seed login: admin@store.com / Admin@12345</p>
        </motion.form>
      </div>
    </div>
  );
}
