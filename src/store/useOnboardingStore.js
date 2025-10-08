import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useOnboardingStore = create(
  persist(
    (set, get) => ({
      // loading/error
      loading: false,
      error: '',

      // computed flags (fetched via hook)
      hasVaultCode: false,
      createdFirstDoc: false,
      connectedCalendar: false,

      // baseline/manual flags you wanted to keep in store
      hasProfile: false,
      emailVerified: false,
      createdWorkspace: false,
      createdPrivateSpace: false,

      // bookkeeping
      lastCheckedAt: null,

      // helpers
      setState: (patch) => set(patch),

      // optional: quick setter for the baseline/manual ones
      setBaselineFlags: (patch) => set(patch),
    }),
    {
      name: 'onboarding-store-v1',
      partialize: (s) => ({
        hasVaultCode: s.hasVaultCode,
        createdFirstDoc: s.createdFirstDoc,
        connectedCalendar: s.connectedCalendar,
        hasProfile: s.hasProfile,
        emailVerified: s.emailVerified,
        createdWorkspace: s.createdWorkspace,
        createdPrivateSpace: s.createdPrivateSpace,
        lastCheckedAt: s.lastCheckedAt,
      }),
    }
  )
);
