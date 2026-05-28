import { api } from '../api/http.js';
import { clearStoredToken, setStoredToken } from './tokenStorage.js';

export async function loginUser(credentials) {
  const response = await api.post('/auth/login', credentials);
  const data = response?.data;

  if (!data || typeof data !== 'object') {
    throw new Error('Invalid login response from server');
  }

  if (!data.token || !data.user) {
    throw new Error(data.message || 'Login response missing token or user information');
  }

  setStoredToken(data.token);
  return data;
}

export function logoutUser() {
  clearStoredToken();
}
