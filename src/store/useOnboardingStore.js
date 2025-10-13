import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const defaults = {
  // computed flags
  hasVaultCode: false,
  createdFirstDoc: false,
  connectedCalendar: false,

  // baseline/manual flags
  hasProfile: false,
  emailVerified: false,
  createdWorkspace: false,
  createdPrivateSpace: false,

  // bookkeeping
  lastCheckedAt: null,
};

export const useOnboardingStore = create(
  persist(
    (set, get) => ({
      // which user these flags belong to
      userId: null,

      // flags
      ...defaults,

      // loading/error (optional)
      loading: false,
      error: '',

      // generic setter you already had
      setState: (patch) => set(patch),

      // optional: keep this if you use it elsewhere
      setBaselineFlags: (patch) => set(patch),

      // NEW: fully reset (use on sign-out or before switching users)
      reset: () => set({ userId: null, ...defaults }),

      // NEW: set flags coming from the server, *scoped to a user*
      // If user changed, drop old flags first.
      setFromServer: (payload, userId) => {
        const prev = get().userId;
        if (prev !== userId) {
          set({ userId, ...defaults, ...payload });
        } else {
          set({ ...payload });
        }
      },
    }),
    {
      name: 'onboarding-store-v1',
      partialize: (s) => ({
        userId: s.userId,
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
