// store/useWorkspaceStore.js
import { create } from "zustand";
import { persist } from "zustand/middleware";

export const useWorkspaceStore = create(
  persist(
    (set, get) => ({
      activeSpaceId: null,
      ownerUserId: null,

      setActiveSpaceId: (id) => set({ activeSpaceId: id }),

      clearActiveSpace: () => set({ activeSpaceId: null }),

      // Call once after you know the logged-in user id.
      // If a different user signs in, reset the selection.
      ensureForUser: (uid) => {
        const { ownerUserId } = get();

        if (!uid) {
          // signed out
          set({ ownerUserId: null, activeSpaceId: null });
          return;
        }

        if (ownerUserId === null) {
          // first time we learn the owner
          set({ ownerUserId: uid });
          return;
        }

        if (ownerUserId !== uid) {
          // user switched -> clear selection for the new user
          set({ ownerUserId: uid, activeSpaceId: null });
        }
      },
    }),
    {
      name: "workspace-store",
      partialize: (state) => ({
        activeSpaceId: state.activeSpaceId,
        ownerUserId: state.ownerUserId,
      }),
    }
  )
);
