import { create } from "zustand";
import { persist } from "zustand/middleware";

export const usePrivateSpaceStore = create(
  persist(
    (set, get) => ({
      ownerUserId: null,
      activeSpaceId: null,

      setActiveSpaceId: (id) => set({ activeSpaceId: id }),
      clearActiveSpace: () => set({ activeSpaceId: null }),

      ensureForUser: (uid) => {
        const { ownerUserId } = get();
        if (!uid) return set({ ownerUserId: null, activeSpaceId: null });
        if (ownerUserId !== uid) set({ ownerUserId: uid, activeSpaceId: null });
      },
    }),
    {
      name: "private-space-store",
      partialize: (s) => ({
        ownerUserId: s.ownerUserId,
        activeSpaceId: s.activeSpaceId,
      }),
    }
  )
);
