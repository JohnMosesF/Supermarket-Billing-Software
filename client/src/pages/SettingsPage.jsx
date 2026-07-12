import { ArrowDown, ArrowUp, ImagePlus, Save } from 'lucide-react';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { api } from '../api/http.js';
import { PageHeader } from '../components/PageHeader.jsx';

const invoiceFields = [
  ['showInvoiceNumber', 'Invoice Number'],
  ['showDate', 'Date'],
  ['showTime', 'Time'],
  ['showCashier', 'Cashier'],
  ['showCustomerName', 'Customer Name'],
  ['showCustomerMobile', 'Customer Mobile'],
  ['showCustomerGST', 'Customer GST'],
  ['showPaymentMethod', 'Payment Method'],
  ['showBarcode', 'Barcode'],
  ['showQRCode', 'QR Code'],
  ['showSKU', 'SKU'],
  ['showProductCode', 'Product Code'],
  ['showHSN', 'HSN'],
  ['showUnit', 'Unit'],
  ['showGSTPercent', 'GST %'],
  ['showItemDiscount', 'Discount'],
  ['showTaxSummary', 'Tax Summary'],
  ['showRoundOff', 'Round Off']
];

const totalFields = [
  ['showSubtotal', 'Subtotal'],
  ['showDiscount', 'Discount'],
  ['showTax', 'Tax'],
  ['showRoundOff', 'Round Off'],
  ['showGrandTotal', 'Grand Total'],
  ['showPaid', 'Paid'],
  ['showBalance', 'Balance'],
  ['showSavings', 'Savings']
];

const defaultTotalsOrder = ['Subtotal', 'Discount', 'Tax', 'RoundOff', 'Savings'];

const defaults = {
  receiptWidth: '72mm',
  thermalPaperWidth: '72mm',
  receiptTopMargin: 2,
  receiptBottomMargin: 3,
  receiptMarginLeft: 3,
  receiptMarginRight: 3,
  receiptFontFamily: 'Consolas',
  receiptFontSize: 11.5,
  receiptLineHeight: 1.25,
  printDensity: 'normal',
  dividerStyle: 'dashed',
  invoiceLanguage: 'English',
  centerHeader: true,
  boldStoreName: true,
  showDividers: true,
  paperFeedAfterPrint: 8,
  numberOfCopies: 1,
  totalsOrder: defaultTotalsOrder,
  showInvoiceNumber: true,
  showDate: true,
  showTime: true,
  showCashier: true,
  showCustomerName: true,
  showCustomerMobile: true,
  showPaymentMethod: true,
  showUnit: true,
  showGSTPercent: true,
  showSubtotal: true,
  showDiscount: true,
  showTax: true,
  showRoundOff: true,
  showGrandTotal: true,
  showPaid: true,
  showBalance: true,
  backupLocation: '',
  automaticBackup: false,
  backupBeforeRestore: true,
  thankYouMessage: 'Thank You For Shopping With Us',
  returnPolicy: 'Goods Once Sold Cannot Be Returned',
  footerLine3: 'Visit Again',
  gstMode: 'cgst_sgst'
};

function Field({ label, children }) {
  return (
    <label className="space-y-1">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</span>
      {children}
    </label>
  );
}

function Checkbox({ register, name, label }) {
  return (
    <label className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900">
      <input type="checkbox" className="h-4 w-4 accent-emerald-600" {...register(name)} />
      <span>{label}</span>
    </label>
  );
}

function Section({ title, description, children }) {
  return (
    <section className="panel p-5">
      <div className="mb-4">
        <h2 className="text-base font-semibold">{title}</h2>
        {description ? <p className="text-sm text-slate-500">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

function normalizePayload(values) {
  const numbers = [
    'defaultTaxRate',
    'lowStockGlobalThreshold',
    'receiptTopMargin',
    'receiptBottomMargin',
    'receiptMarginLeft',
    'receiptMarginRight',
    'receiptFontSize',
    'receiptLineHeight',
    'paperFeedAfterPrint',
    'numberOfCopies'
  ];
  const payload = { ...values, thermalPaperWidth: values.receiptWidth === 'A4' ? '80mm' : values.receiptWidth };
  for (const key of numbers) payload[key] = Number(payload[key] || 0);
  payload.totalsOrder = Array.isArray(values.totalsOrder) && values.totalsOrder.length ? values.totalsOrder : defaultTotalsOrder;
  return payload;
}

export function SettingsPage() {
  const { register, handleSubmit, reset, watch, setValue, getValues } = useForm({ defaultValues: defaults });
  const totalsOrder = watch('totalsOrder') || defaultTotalsOrder;

  useEffect(() => {
    api.get('/settings').then((res) => reset({ ...defaults, ...res.data.settings, totalsOrder: res.data.settings?.totalsOrder?.length ? res.data.settings.totalsOrder : defaultTotalsOrder }));
  }, [reset]);

  async function save(values) {
    await api.patch('/settings', normalizePayload(values));
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
    form.set('confirmation', window.prompt('Type RESTORE to confirm database restore') || '');
    form.set('backupBeforeRestore', String(getValues('backupBeforeRestore') !== false));
    if (form.get('confirmation') !== 'RESTORE') return toast.error('Restore cancelled');
    await api.post('/backup/restore', form, { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
    toast.success('Backup restored');
  }

  function moveTotal(index, direction) {
    const current = [...(getValues('totalsOrder') || defaultTotalsOrder)];
    const target = index + direction;
    if (target < 0 || target >= current.length) return;
    [current[index], current[target]] = [current[target], current[index]];
    setValue('totalsOrder', current, { shouldDirty: true });
  }

  function handleLogoUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setValue('logoUrl', reader.result, { shouldDirty: true });
    reader.readAsDataURL(file);
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Settings" description="Store details, invoice layout, thermal printer preferences, GST options, and backups." />

      <form className="space-y-5" onSubmit={handleSubmit(save)}>
        <Section title="Store Details" description="These details appear in the receipt header. Optional fields stay hidden when empty.">
          <div className="grid gap-4 md:grid-cols-2">
            <input className="input" placeholder="Store Name" {...register('storeName')} />
            <input className="input" placeholder="Branch Name" {...register('branchName')} />
            <input className="input" placeholder="Address Line 1" {...register('addressLine1')} />
            <input className="input" placeholder="Address Line 2" {...register('addressLine2')} />
            <input className="input" placeholder="City" {...register('city')} />
            <input className="input" placeholder="State" {...register('state')} />
            <input className="input" placeholder="Pincode" {...register('pincode')} />
            <input className="input" placeholder="Phone" {...register('phone')} />
            <input className="input" placeholder="WhatsApp" {...register('whatsapp')} />
            <input className="input" placeholder="Email" {...register('email')} />
            <input className="input" placeholder="Website" {...register('website')} />
            <input className="input" placeholder="GSTIN" {...register('gstNumber')} />
            <input className="input" placeholder="FSSAI Number" {...register('fssaiNumber')} />
            <label className="btn-muted cursor-pointer">
              <ImagePlus size={17} /> Logo Upload
              <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
            </label>
          </div>
        </Section>

        <Section title="Receipt Layout" description="Controls thermal width, spacing, type, dividers, and feed after print.">
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Receipt Width">
              <select className="input" {...register('receiptWidth')}>
                <option value="58mm">58mm</option>
                <option value="72mm">72mm</option>
                <option value="80mm">80mm</option>
                <option value="A4">A4</option>
              </select>
            </Field>
            <Field label="Font Family">
              <select className="input" {...register('receiptFontFamily')}>
                <option value="Consolas">Consolas</option>
                <option value="Courier New">Courier New</option>
                <option value="Roboto Mono">Roboto Mono</option>
                <option value="IBM Plex Mono">IBM Plex Mono</option>
              </select>
            </Field>
            <Field label="Divider Style">
              <select className="input" {...register('dividerStyle')}>
                <option value="solid">Solid Line</option>
                <option value="dashed">Dashed Line</option>
                <option value="double">Double Line</option>
              </select>
            </Field>
            <Field label="Top Margin (mm)"><input className="input" type="number" step="0.5" {...register('receiptTopMargin')} /></Field>
            <Field label="Bottom Margin (mm)"><input className="input" type="number" step="0.5" {...register('receiptBottomMargin')} /></Field>
            <Field label="Left Margin (mm)"><input className="input" type="number" step="0.5" {...register('receiptMarginLeft')} /></Field>
            <Field label="Right Margin (mm)"><input className="input" type="number" step="0.5" {...register('receiptMarginRight')} /></Field>
            <Field label="Font Size"><input className="input" type="number" step="0.5" {...register('receiptFontSize')} /></Field>
            <Field label="Line Height"><input className="input" type="number" step="0.05" {...register('receiptLineHeight')} /></Field>
            <Field label="Print Density">
              <select className="input" {...register('printDensity')}>
                <option value="compact">Compact</option>
                <option value="normal">Normal</option>
                <option value="bold">Bold</option>
              </select>
            </Field>
            <Field label="Paper Feed After Print (mm)"><input className="input" type="number" {...register('paperFeedAfterPrint')} /></Field>
            <Checkbox register={register} name="centerHeader" label="Center Header" />
            <Checkbox register={register} name="boldStoreName" label="Bold Store Name" />
            <Checkbox register={register} name="showDividers" label="Show Dividers" />
          </div>
        </Section>

        <Section title="Invoice Settings">
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Invoice Language">
              <select className="input" {...register('invoiceLanguage')}>
                <option value="English">English</option>
                <option value="Local Language">Local Language</option>
              </select>
            </Field>
          </div>
        </Section>

        <Section title="Invoice Fields" description="Enable or disable receipt details and product metadata.">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {invoiceFields.map(([name, label]) => <Checkbox key={name} register={register} name={name} label={label} />)}
          </div>
        </Section>

        <Section title="Totals Section" description="Choose visible totals and reorder the compact totals block.">
          <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {totalFields.map(([name, label]) => <Checkbox key={name} register={register} name={name} label={label} />)}
            </div>
            <div className="space-y-2">
              {totalsOrder.map((item, index) => (
                <div key={item} className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-sm dark:border-slate-700">
                  <span>{item.replace('RoundOff', 'Round Off')}</span>
                  <div className="flex gap-1">
                    <button type="button" className="btn-muted px-2 py-1" onClick={() => moveTotal(index, -1)}><ArrowUp size={14} /></button>
                    <button type="button" className="btn-muted px-2 py-1" onClick={() => moveTotal(index, 1)}><ArrowDown size={14} /></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Section>

        <Section title="Footer Settings" description="Footer text is centered and printed only when configured.">
          <div className="grid gap-4 md:grid-cols-2">
            <input className="input" placeholder="Thank You Message" {...register('thankYouMessage')} />
            <input className="input" placeholder="Return Policy" {...register('returnPolicy')} />
            <input className="input" placeholder="Footer Line 1" {...register('footerLine1')} />
            <input className="input" placeholder="Footer Line 2" {...register('footerLine2')} />
            <input className="input" placeholder="Footer Line 3" {...register('footerLine3')} />
            <input className="input" placeholder="Invoice Footer (legacy)" {...register('invoiceFooter')} />
            <Checkbox register={register} name="signatureLine" label="Signature Line" />
          </div>
        </Section>

        <Section title="Printer Settings" description="Desktop printing keeps using the existing Electron print bridge.">
          <div className="grid gap-4 md:grid-cols-3">
            <input className="input" placeholder="Printer Selection / Name" {...register('printerName')} />
            <Field label="Number of Copies"><input className="input" type="number" min="1" {...register('numberOfCopies')} /></Field>
            <Checkbox register={register} name="autoPrint" label="Auto Print" />
            <Checkbox register={register} name="printPreview" label="Print Preview" />
            <Checkbox register={register} name="silentPrinting" label="Silent Printing" />
            <Checkbox register={register} name="openCashDrawer" label="Open Cash Drawer" />
            <Checkbox register={register} name="cutPaper" label="Cut Paper" />
          </div>
        </Section>

        <Section title="QR, Barcode, and GST" description="Payment QR and GST display settings for printed invoices.">
          <div className="grid gap-4 md:grid-cols-3">
            <Checkbox register={register} name="enableBarcode" label="Enable Barcode" />
            <Checkbox register={register} name="enableQRCode" label="Enable QR Code" />
            <Checkbox register={register} name="upiQr" label="UPI QR" />
            <input className="input" placeholder="UPI ID" {...register('upiId')} />
            <input className="input" placeholder="UPI Name" {...register('upiName')} />
            <Field label="GST Mode">
              <select className="input" {...register('gstMode')}>
                <option value="cgst_sgst">CGST + SGST</option>
                <option value="igst">IGST</option>
              </select>
            </Field>
            <Checkbox register={register} name="taxInclusive" label="GST Inclusive" />
            <Checkbox register={register} name="gstExclusive" label="GST Exclusive" />
            <Checkbox register={register} name="showTaxableAmount" label="Show Taxable Amount" />
            <Field label="Currency"><input className="input" placeholder="INR" {...register('currency')} /></Field>
            <Field label="Default GST %"><input className="input" type="number" {...register('defaultTaxRate')} /></Field>
            <Field label="Low Stock Threshold"><input className="input" type="number" {...register('lowStockGlobalThreshold')} /></Field>
          </div>
        </Section>

        <button className="btn-primary w-full"><Save size={17} />Save settings</button>
      </form>

      <div className="panel flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-semibold">Backup and restore</h2>
          <p className="text-sm text-slate-500">Export MongoDB data or restore a previous backup file with confirmation.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-muted" onClick={downloadBackup}>Download backup</button>
          <label className="btn-primary cursor-pointer">
            Restore
            <input type="file" accept="application/json" className="hidden" onChange={restoreBackup} />
          </label>
        </div>
      </div>

      <form className="panel space-y-4 p-5" onSubmit={handleSubmit(save)}>
        <h2 className="font-semibold">Backup Settings</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <input className="input" placeholder="Backup Location" {...register('backupLocation')} />
          <Checkbox register={register} name="automaticBackup" label="Automatic Backup" />
          <Checkbox register={register} name="backupBeforeRestore" label="Backup before Restore" />
        </div>
        <button className="btn-primary"><Save size={17} />Save backup settings</button>
      </form>
    </div>
  );
}
