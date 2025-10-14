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
      // who these flags belong to
      userId: null,

      // flags
      ...defaults,

      // ui state
      loading: false,
      error: '',

      // generic setter (supports object or updater fn)
      setState: (patch) => {
        if (typeof patch === 'function') set(patch);
        else if (patch && typeof patch === 'object') set(patch);
      },

      // keep if used elsewhere, but same hardening
      setBaselineFlags: (patch) => {
        if (patch && typeof patch === 'object') set(patch);
      },

      // fully reset (use on sign-out or user switch)
      reset: () => set({
        userId: null,
        ...defaults,
        loading: false,
        error: '',
      }),

      // ingest server flags, scoped by user
      setFromServer: (payload, userId) => {
        if (!payload || typeof payload !== 'object') return;

        const prevUser = get().userId;
        const common = {
          ...payload,
          // always stamp when we accept server state
          lastCheckedAt: new Date().toISOString(),
          loading: false,
          error: '',
        };

        if (prevUser !== userId) {
          set({ userId, ...defaults, ...common });
        } else {
          set(common);
        }
      },
    }),
    {
      name: 'onboarding-store-v1',
      // add versioning so you can migrate persisted keys later if needed
      version: 1,
      // migrate: (persisted, version) => persisted,

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
        // intentionally NOT persisting loading/error
      }),
    }
  )
);
