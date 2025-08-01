import { create } from "zustand";

export const useWorkspaceStore = create((set) => ({
  activeWorkspaceId: null,
  setActiveWorkspaceId: (id) => set({ activeWorkspaceId: id }),
}));