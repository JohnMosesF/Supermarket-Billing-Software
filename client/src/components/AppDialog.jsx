import { XCircle } from 'lucide-react';

export function ConfirmDialog({
  open,
  title = 'Confirm',
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  busy = false,
  onCancel,
  onConfirm
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="panel w-full max-w-md p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold">{title}</h2>
          <button type="button" className="btn-muted h-9 w-9 p-0" onClick={onCancel} disabled={busy}>
            <XCircle size={16} />
          </button>
        </div>
        {message ? <p className="text-sm text-slate-600 dark:text-slate-300">{message}</p> : null}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn-muted" onClick={onCancel} disabled={busy}>{cancelLabel}</button>
          <button type="button" className={danger ? 'btn-danger' : 'btn-primary'} onClick={onConfirm} disabled={busy}>
            {busy ? 'Working...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function TextInputDialog({
  open,
  title,
  label,
  value,
  error,
  inputType = 'text',
  placeholder = '',
  confirmLabel = 'Save',
  cancelLabel = 'Cancel',
  busy = false,
  readOnlyRows = [],
  onChange,
  onCancel,
  onConfirm
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="panel w-full max-w-md p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold">{title}</h2>
          <button type="button" className="btn-muted h-9 w-9 p-0" onClick={onCancel} disabled={busy}>
            <XCircle size={16} />
          </button>
        </div>
        {readOnlyRows.length ? (
          <div className="mb-4 space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-800 dark:bg-slate-900">
            {readOnlyRows.map((row) => (
              <div key={row.label} className="flex justify-between gap-3">
                <span className="text-slate-500">{row.label}</span>
                <strong className="text-right">{row.value || '-'}</strong>
              </div>
            ))}
          </div>
        ) : null}
        <label className="space-y-1">
          <span className="text-xs font-semibold uppercase text-slate-500">{label}</span>
          <input
            className="input"
            type={inputType}
            placeholder={placeholder}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                onConfirm();
              }
            }}
            autoFocus
          />
        </label>
        {error ? <p className="mt-2 text-sm font-semibold text-red-600">{error}</p> : null}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn-muted" onClick={onCancel} disabled={busy}>{cancelLabel}</button>
          <button type="button" className="btn-primary" onClick={onConfirm} disabled={busy}>
            {busy ? 'Working...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
