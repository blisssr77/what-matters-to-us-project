import { create } from "zustand";
import { persist } from "zustand/middleware";

export const useWorkspaceStore = create(
  persist(
    (set, get) => ({
      userId: null,
      activeWorkspaceId: null,

      setActiveWorkspaceId: (id) => set({ activeWorkspaceId: id }),
      clearActiveWorkspace: () => set({ activeWorkspaceId: null }),

      // Call after you know the signed-in user id.
      ensureForUser: (uid) => {
        const { userId } = get();
        if (!uid) return set({ userId: null, activeWorkspaceId: null });
        if (userId !== uid) set({ userId: uid, activeWorkspaceId: null });
      },
    }),
    {
      name: "workspace-store",
      partialize: (s) => ({
        userId: s.userId,
        activeWorkspaceId: s.activeWorkspaceId,
      }),
    }
  )
);
