import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { supabase } from '@/lib/supabaseClient';

// tiny helper so tag filters work whether you pass "Design" or "design"
// const slug = (s = '') =>
//   String(s)
//     .toLowerCase()
//     .normalize('NFKD')
//     .replace(/[^\w\s-]/g, '')
//     .trim()
//     .replace(/\s+/g, '-');

const defaultFilters = {
  search: '',
  assigneeId: null,       // string | null
  statuses: [],           // e.g. ['in_progress','blocked']
  tagSlugs: [],           // array of lower/slugged tag names
  mineOnly: false,        // only events where created_by === currentUserId
  includeWorkspace: true,
  includePrivate: true,
  showPublicOnly: false,
  showVaultedOnly: false,
};

// Get my workspace ids (membership)
// const { data: { user } } = await supabase.auth.getUser();
// const uid = user?.id;

// const { data: myWsRows } = await supabase
//   .from('workspace_members')
//   .select('workspace_id')
//   .eq('user_id', uid);

// const myWorkspaceIds = (myWsRows ?? []).map(r => r.workspace_id);

// // Workspace events: only from my workspaces
// const { data: wsEvents } = await supabase
//   .from('workspace_calendar_items_secure')
//   .select('*')
//   .in('workspace_id', myWorkspaceIds);

// // Private events: only mine (or your visibility rule)
// const { data: pvEvents } = await supabase
//   .from('private_calendar_items_secure')
//   .select('*')
//   .eq('created_by', uid);

// // then combine → store.setEvents(mapToFullCalendar([...wsEvents, ...pvEvents]))
// // ALSO push the allowed ids into the store (below).
// useCalendarStore.getState().setAllowedScopes({
//   workspaceIds: myWorkspaceIds,
//   privateSpaceIds: [], // if you ever gate private spaces, set here
//   currentUserId: uid,
// });

export const useCalendarStore = create(
  persist(
    (set, get) => ({
      // core
      view: 'week',
      range: { from: null, to: null },
      anchorDate: null,
      filters: defaultFilters,
      events: [],
      loading: false,
      error: null,
      selectedEventId: null,

      // current user + allowed scopes (NOT persisted)
      currentUserId: null,
      allowedWorkspaceIds: [],
      allowedPrivateSpaceIds: [],

      // selections (persisted)
      selectedWorkspaceIds: [],
      showAllWorkspaces: true,
      selectedPrivateSpaceIds: [],
      showAllPrivateSpaces: true,

      // setters
      setView: (view) => set({ view }),
      setRange: (range) => set({ range }),
      setAnchorDate: (isoOrNull) => set({ anchorDate: isoOrNull }),
      setFilters: (partial) => set({ filters: { ...get().filters, ...partial } }),
      resetFilters: () => set({ filters: { ...defaultFilters } }),

      setLoading: (loading) => set({ loading }),
      setError: (error) => set({ error }),

      setEvents: (events = []) => set({ events }),
      upsertEventLocal: (evt) => {
        const list = get().events.slice();
        const idx = list.findIndex((e) => e.id === evt.id);
        if (idx >= 0) list[idx] = { ...list[idx], ...evt };
        else list.push(evt);
        set({ events: list });
      },
      updateTimeLocal: ({ id, start, end, allDay }) =>
        set({ events: get().events.map(e => e.id === id ? { ...e, start, end, allDay } : e) }),
      removeEventLocal: (id) => set({ events: get().events.filter(e => e.id !== id) }),

      setSelectedEventId: (id) => set({ selectedEventId: id }),
      clearSelected: () => set({ selectedEventId: null }),

      setSelectedWorkspaceIds: (ids = []) =>
        set({ selectedWorkspaceIds: Array.from(new Set(ids.map(String))), showAllWorkspaces: ids.length === 0 }),
      toggleWorkspaceId: (id) => {
        const cur = new Set(get().selectedWorkspaceIds.map(String));
        const key = String(id);
        cur.has(key) ? cur.delete(key) : cur.add(key);
        set({ selectedWorkspaceIds: Array.from(cur), showAllWorkspaces: cur.size === 0 });
      },
      setShowAllWorkspaces: (flag) => set({ showAllWorkspaces: !!flag, ...(flag ? { selectedWorkspaceIds: [] } : null) }),

      setSelectedPrivateSpaceIds: (ids = []) =>
        set({ selectedPrivateSpaceIds: Array.from(new Set(ids.map(String))), showAllPrivateSpaces: ids.length === 0 }),
      togglePrivateSpaceId: (id) => {
        const cur = new Set(get().selectedPrivateSpaceIds.map(String));
        const key = String(id);
        cur.has(key) ? cur.delete(key) : cur.add(key);
        set({ selectedPrivateSpaceIds: Array.from(cur), showAllPrivateSpaces: cur.size === 0 });
      },
      setShowAllPrivateSpaces: (flag) => set({ showAllPrivateSpaces: !!flag, ...(flag ? { selectedPrivateSpaceIds: [] } : null) }),

      setCurrentUserId: (id) => set({ currentUserId: id }),
      setAllowedScopes: ({ workspaceIds = [], privateSpaceIds = [], currentUserId = null }) =>
        set({
          allowedWorkspaceIds: Array.from(new Set((workspaceIds || []).map(String))),
          allowedPrivateSpaceIds: Array.from(new Set((privateSpaceIds || []).map(String))),
          ...(currentUserId ? { currentUserId } : null),
        }),

      // client filter (fixed union)
      _filterEvents: () => {
        const {
          events = [], filters,
          selectedWorkspaceIds, showAllWorkspaces,
          selectedPrivateSpaceIds, showAllPrivateSpaces,
          currentUserId, allowedWorkspaceIds, allowedPrivateSpaceIds,
        } = get();

        const useWS = !!filters.includeWorkspace;
        const usePR = !!filters.includePrivate;

        const wsAllowed = new Set((allowedWorkspaceIds || []).map(String));
        const prAllowed = new Set((allowedPrivateSpaceIds || []).map(String));
        const wsSelected = new Set((selectedWorkspaceIds || []).map(String));
        const prSelected = new Set((selectedPrivateSpaceIds || []).map(String));

        return (events || []).filter((ev) => {
          const evWs = ev?.workspace_id != null ? String(ev.workspace_id) : null;
          const evPr = ev?.private_space_id != null ? String(ev.private_space_id) : null;

          let passWS = false;
          if (useWS && evWs !== null && wsAllowed.has(evWs)) {
            passWS = showAllWorkspaces || wsSelected.has(evWs);
          }

          let passPR = false;
          if (usePR && evPr !== null && (prAllowed.size ? prAllowed.has(evPr) : true)) {
            passPR = showAllPrivateSpaces || prSelected.has(evPr);
          }

          if (filters.mineOnly && currentUserId) {
            const mine = ev.created_by === currentUserId || ev.assignee_id === currentUserId;
            if (!mine) return false;
          }

          return (useWS && passWS) || (usePR && passPR);
        });
      },
    }),
    {
      name: 'wm-calendar-store',
      partialize: (s) => ({
        view: s.view,
        filters: s.filters,
        selectedWorkspaceIds: s.selectedWorkspaceIds,
        showAllWorkspaces: s.showAllWorkspaces,
        selectedPrivateSpaceIds: s.selectedPrivateSpaceIds,
        showAllPrivateSpaces: s.showAllPrivateSpaces,
        anchorDate: s.anchorDate,
      }),
    }
  )
);

// Selector that returns filtered events
export const selectFilteredEvents = (state) => state._filterEvents();

// Convenience selectors
export const selectRange = (state) => state.range;
export const selectView = (state) => state.view;
export const selectFilters = (state) => state.filters;
export const selectLoading = (state) => state.loading;
export const selectError = (state) => state.error;
export const selectSelectedEventId = (state) => state.selectedEventId;
