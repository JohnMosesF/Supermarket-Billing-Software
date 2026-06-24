import React, { useEffect } from 'react';
import ModernPOSBilling from './ModernPOSBilling.jsx';

export default function BillingWindow() {

  useEffect(() => {
    document.body.style.margin = '0';

    console.log('Billing window loaded');

    if (window.electronAPI?.getWindowData) {
      const data = window.electronAPI.getWindowData();
      console.log('WINDOW DATA:', data);
    }
  }, []);

  return (
    <div className="h-screen bg-slate-100 dark:bg-slate-900">
      <div className="mx-auto h-full max-w-[1600px] p-2">
        <ModernPOSBilling />
      </div>
    </div>
  );
}