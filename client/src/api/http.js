import axios from 'axios';
import toast from 'react-hot-toast';
import { useAuthStore } from '../store/authStore.js';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api'
});

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      useAuthStore.getState().logout();
    }
    const message = error.response?.data?.message || error.message || 'Request failed';
    if (!error.config?.silent) toast.error(message);
    return Promise.reject(error);
  }
);
