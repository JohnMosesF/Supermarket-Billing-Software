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

    if (error.response?.status === 401) {
      clearStoredToken();
    }

    const message = error.response?.data?.message || error.message || 'Request failed';
    if (!error.config?.silent) toast.error(message);
    return Promise.reject(error);
  }
);
