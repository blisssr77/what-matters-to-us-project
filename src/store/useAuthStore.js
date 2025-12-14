import { create } from "zustand";

export const useAuthStore = create((set) => ({
  user: null,
  session: null,
  isAuthLoading: true, // Helpful for showing a loading spinner on refresh

  setAuth: (session) => {
    set({
      user: session?.user || null,
      session: session,
      isAuthLoading: false,
    });
  },

  clearAuth: () => {
    set({ user: null, session: null, isAuthLoading: false });
  },
}));