import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useUiStore = create(
  persist(
    (set) => ({
      darkMode: false,
      collapsed: false,
      toggleTheme: () => set((state) => ({ darkMode: !state.darkMode })),
      toggleSidebar: () => set((state) => ({ collapsed: !state.collapsed }))
    }),
    { name: 'supermarket-ui' }
  )
);
