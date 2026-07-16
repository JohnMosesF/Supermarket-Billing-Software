import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import App from './App.jsx';
import './index.css';
import { logoutUser } from './services/authService.js';
import { useAuthStore } from './store/authStore.js';
import { ResponsiveLayout } from './layouts/ResponsiveLayout.jsx';

const Router = window.location.protocol === 'file:' ? HashRouter : BrowserRouter;

function setupElectronForceLogout() {
  try {
    if (!window.electronAPI?.onForceLogout) return;
    window.electronAPI.onForceLogout(async () => {
      try {
        useAuthStore.getState().logout?.();
      } catch {
        // ignore
      }
      try {
        logoutUser();
      } catch {
        // ignore
      }
    });
  } catch {
    // ignore
  }
}

setupElectronForceLogout();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Router>
      <ResponsiveLayout>
        <App />
      </ResponsiveLayout>
      <Toaster position="top-right" toastOptions={{ duration: 3000 }} />
    </Router>
  </React.StrictMode>
);
