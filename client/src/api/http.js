import axios from 'axios';
import toast from 'react-hot-toast';
import { clearStoredToken, getStoredToken } from '../services/tokenStorage.js';

export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json'
  },
  withCredentials: true
});

api.interceptors.request.use((config) => {
  const token = getStoredToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const requestUrl = error.config?.url || 'unknown endpoint';
    console.error('API request failed:', requestUrl, error.message, error.response?.data || 'no response');

    // Prevent repeated toasts for the same error in a short window
    if (!api._lastToast) api._lastToast = { msg: null, ts: 0 };
    const now = Date.now();
    const message = error.response?.data?.message || error.message || 'Request failed';

    // If 401, clear token and force reload to trigger app auth flow
    if (error.response?.status === 401) {
      clearStoredToken();
      if (!error.config?.silent) {
        if (api._lastToast.msg !== 'Session expired' || now - api._lastToast.ts > 5000) {
          toast.error('Session expired. Logging out...');
          api._lastToast = { msg: 'Session expired', ts: now };
        }
      }
      // reload to ensure app returns to login
      setTimeout(() => {
        try { window.location.reload(); } catch (e) { /* ignore */ }
      }, 500);
      return Promise.reject(error);
    }

    if (!error.config?.silent) {
      if (api._lastToast.msg !== message || now - api._lastToast.ts > 4000) {
        toast.error(message);
        api._lastToast = { msg: message, ts: now };
      }
    }

    return Promise.reject(error);
  }
);
