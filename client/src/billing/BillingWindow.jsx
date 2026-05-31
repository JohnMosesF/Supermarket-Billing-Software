import React, { useEffect } from 'react';
import ModernPOSBilling from './ModernPOSBilling.jsx';

function useQuery() {
  const hash = window.location.hash || '';
  const querySource = hash.includes('?') ? hash.substring(hash.indexOf('?')) : window.location.search;
  return new URLSearchParams(querySource);
}

export default function BillingWindow() {
  useEffect(() => {
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
