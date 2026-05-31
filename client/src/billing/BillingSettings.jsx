import { useState, useEffect } from 'react';

const DEFAULTS = {
  enableShortcuts: true,
  enablePriceEdit: true,
  autofocusCode: true,
  autoAddOnEnter: true,
  soundOnAdd: false,
  barcodeMode: true,
};

export default function BillingSettings({ onChange }) {
  const [settings, setSettings] = useState(() => {
    try {
      const s = localStorage.getItem('billingSettings');
      return s ? JSON.parse(s) : DEFAULTS;
    } catch (e) {
      return DEFAULTS;
    }
  });

  useEffect(() => {
    localStorage.setItem('billingSettings', JSON.stringify(settings));
    onChange?.(settings);
  }, [settings]);

  return (
    <div className="space-y-2">
      {Object.keys(DEFAULTS).map((k) => (
        <label key={k} className="flex items-center gap-2">
          <input type="checkbox" checked={!!settings[k]} onChange={(e) => setSettings((s) => ({ ...s, [k]: e.target.checked }))} />
          <span className="capitalize text-sm">{k.replace(/([A-Z])/g, ' $1')}</span>
        </label>
      ))}
    </div>
  );
}
