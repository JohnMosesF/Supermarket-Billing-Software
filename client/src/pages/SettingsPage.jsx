import { Save } from 'lucide-react';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { api } from '../api/http.js';
import { PageHeader } from '../components/PageHeader.jsx';

export function SettingsPage() {
  const { register, handleSubmit, reset } = useForm();

  useEffect(() => {
    api.get('/settings').then((res) => reset(res.data.settings));
  }, [reset]);

  async function save(values) {
    await api.patch('/settings', { ...values, defaultTaxRate: Number(values.defaultTaxRate || 0), lowStockGlobalThreshold: Number(values.lowStockGlobalThreshold || 0) });
    toast.success('Settings saved');
  }

  async function downloadBackup() {
    const { data } = await api.get('/backup', { responseType: 'blob' });
    const url = URL.createObjectURL(data);
    const link = document.createElement('a');
    link.href = url;
    link.download = `supermarket-backup-${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function restoreBackup(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const payload = await file.text();
    const form = new URLSearchParams();
    form.set('payload', payload);
    await api.post('/backup/restore', form, { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
    toast.success('Backup restored');
  }

  return (
    <div>
      <PageHeader title="Settings" description="Store details, invoice footer, tax defaults, currency, and thermal printer preferences." />
      <form className="panel grid gap-4 p-5 md:grid-cols-2" onSubmit={handleSubmit(save)}>
        <input className="input" placeholder="Store name" {...register('storeName')} />
        <input className="input" placeholder="Phone" {...register('phone')} />
        <input className="input" placeholder="Email" {...register('email')} />
        <input className="input" placeholder="GST number" {...register('gstNumber')} />
        <input className="input md:col-span-2" placeholder="Address" {...register('address')} />
        <input className="input" placeholder="Currency" {...register('currency')} />
        <input className="input" type="number" placeholder="Default GST %" {...register('defaultTaxRate')} />
        <input className="input" placeholder="Printer name" {...register('printerName')} />
        <select className="input" {...register('thermalPaperWidth')}>
          <option value="80mm">80mm</option>
          <option value="58mm">58mm</option>
        </select>
        <input className="input md:col-span-2" placeholder="Invoice footer" {...register('invoiceFooter')} />
        <button className="btn-primary md:col-span-2"><Save size={17} />Save settings</button>
      </form>
      <div className="panel mt-5 flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-semibold">Backup and restore</h2>
          <p className="text-sm text-slate-500">Export a JSON backup or restore a previous backup file.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-muted" onClick={downloadBackup}>Download backup</button>
          <label className="btn-primary cursor-pointer">
            Restore
            <input type="file" accept="application/json" className="hidden" onChange={restoreBackup} />
          </label>
        </div>
      </div>
    </div>
  );
}
