import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import axios from 'axios';

const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export const useAuthStore = create(
  persist(
    (set) => ({
      token: null,
      user: null,
      login: async (credentials) => {
        const { data } = await axios.post(`${baseURL}/auth/login`, credentials);
        set({ token: data.token, user: data.user });
        return data.user;
      },
      setSession: (session) => set(session),
      logout: () => set({ token: null, user: null })
    }),
    { name: 'supermarket-session' }
  )
);
