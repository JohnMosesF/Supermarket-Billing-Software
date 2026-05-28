import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { loginUser, logoutUser } from '../services/authService.js';
import { setStoredToken } from '../services/tokenStorage.js';

export const useAuthStore = create(
  persist(
    (set) => ({
      token: null,
      user: null,
      login: async (credentials) => {
        const data = await loginUser(credentials);
        if (!data?.token) {
          throw new Error('Login response did not include a token');
        }
        set({ token: data.token, user: data.user });
        return data.user;
      },
      setSession: (session) => set(session),
      logout: () => {
        logoutUser();
        set({ token: null, user: null });
      }
    }),
    {
      name: 'supermarket-session',
      onRehydrateStorage: () => (state) => {
        if (state?.token) {
          setStoredToken(state.token);
        }
      }
    }
  )
);
