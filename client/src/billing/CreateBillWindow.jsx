import React, { useEffect } from 'react';
import ModernPOSBilling from './ModernPOSBilling.jsx';

export default function CreateBillWindow() {
  useEffect(() => {
    // Ensure body has no large paddings and fullscreen POS feel
    document.body.style.margin = '0';
  }, []);

  return (
    <div className="h-screen bg-slate-100 dark:bg-slate-900">
      <div className="mx-auto h-full max-w-[1600px] p-2">
        <ModernPOSBilling />
      </div>
    </div>
  );
}
}
