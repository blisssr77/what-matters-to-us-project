import { create } from "zustand";
import { persist } from "zustand/middleware";

export const useWorkspaceStore = create(
  persist(
    (set) => ({
      activeWorkspaceId: null,
      setActiveWorkspaceId: (id) => {
        set({ activeWorkspaceId: id });
      },
    }),
    {
      name: "workspace-store", // key in localStorage
    }
  )
);