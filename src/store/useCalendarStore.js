import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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

export const useCalendarStore = create(
  persist(
    (set, get) => ({
      // ---------- Core state ----------
      range: { from: null, to: null },          // ISO strings
      view: 'timeGridWeek',                      // 'dayGridMonth' | 'timeGridWeek' | 'timeGridDay'...
      filters: defaultFilters,
      currentUserId: null,                       // set from your auth flow (optional)
      events: [],                                // FullCalendar-ready objects
      loading: false,
      error: null,
      selectedEventId: null,                     // for modals

      // ---------- Setters ----------
      setRange: (range) => set({ range }),
      setView: (view) => set({ view }),
      setFilters: (partial) => set({ filters: { ...get().filters, ...partial } }),
      resetFilters: () => set({ filters: { ...defaultFilters } }),
      setCurrentUserId: (id) => set({ currentUserId: id }),

      setEvents: (events = []) => set({ events }),
      upsertEventLocal: (evt) => {
        const list = get().events.slice();
        const idx = list.findIndex((e) => e.id === evt.id);
        if (idx >= 0) list[idx] = { ...list[idx], ...evt };
        else list.push(evt);
        set({ events: list });
      },
      updateTimeLocal: ({ id, start, end, allDay }) => {
        const list = get().events.map((e) =>
          e.id === id ? { ...e, start, end, allDay } : e
        );
        set({ events: list });
      },
      removeEventLocal: (id) => {
        set({ events: get().events.filter((e) => e.id !== id) });
      },

      setLoading: (loading) => set({ loading }),
      setError: (error) => set({ error }),

      setSelectedEventId: (id) => set({ selectedEventId: id }),
      clearSelected: () => set({ selectedEventId: null }),

      // ------------------------------------------- Workspace filtering -------------------------------------------
      selectedWorkspaceIds: [],        // [] means "All Workspaces"
      showAllWorkspaces: true,

      setSelectedWorkspaceIds: (ids = []) => set({
        selectedWorkspaceIds: Array.from(new Set(ids.map(String))),
        showAllWorkspaces: ids.length === 0,
      }),
      toggleWorkspaceId: (id) => {
        const cur = new Set(get().selectedWorkspaceIds.map(String));
        const key = String(id);
        if (cur.has(key)) cur.delete(key);
        else cur.add(key);
        set({
          selectedWorkspaceIds: Array.from(cur),
          showAllWorkspaces: cur.size === 0,
        });
      },
      setShowAllWorkspaces: (flag) => set({
        showAllWorkspaces: !!flag,
        ...(flag ? { selectedWorkspaceIds: [] } : null),
      }),

      // ------------------------------------------- Private Space filtering -------------------------------------------
      selectedPrivateSpaceIds: [],     // [] means "All Private Spaces"
      showAllPrivateSpaces: true,

      setSelectedPrivateSpaceIds: (ids = []) => set({
        selectedPrivateSpaceIds: Array.from(new Set(ids.map(String))),
        showAllPrivateSpaces: ids.length === 0,
      }),
      togglePrivateSpaceId: (id) => {
        const cur = new Set(get().selectedPrivateSpaceIds.map(String));
        const key = String(id);
        if (cur.has(key)) cur.delete(key);
        else cur.add(key);
        set({
          selectedPrivateSpaceIds: Array.from(cur),
          showAllPrivateSpaces: cur.size === 0,
        });
      },
      setShowAllPrivateSpaces: (flag) => set({
        showAllPrivateSpaces: !!flag,
        ...(flag ? { selectedPrivateSpaceIds: [] } : null),
      }),

      // ---------- Convenience flags for scope (sidebar switches) ----------
      setIncludeWorkspace: (val) =>
        set({ filters: { ...get().filters, includeWorkspace: !!val } }),
      setIncludePrivate: (val) =>
        set({ filters: { ...get().filters, includePrivate: !!val } }),

      _filterEvents: () => {
        const {
          events = [],
          filters = {},
          selectedWorkspaceIds = [],
          selectedPrivateSpaceIds = [],
          showAllWorkspaces,
          showAllPrivateSpaces,
        } = get();

        const useWS = !!filters.includeWorkspace;
        const usePR = !!filters.includePrivate;

        const wsSet = new Set((selectedWorkspaceIds || []).map(String));
        const prSet = new Set((selectedPrivateSpaceIds || []).map(String));

        return (events || []).filter((ev) => {
          const evWsId = ev?.workspace_id != null ? String(ev.workspace_id) : null;
          const evPrId = ev?.private_space_id != null ? String(ev.private_space_id) : null;

          // workspace pass
          let passWS = false;
          if (useWS) {
            if (showAllWorkspaces) {
              passWS = evWsId !== null; // any workspace event
            } else {
              passWS = evWsId !== null && wsSet.has(evWsId);
            }
          }

          // private pass
          let passPR = false;
          if (usePR) {
            if (showAllPrivateSpaces) {
              passPR = evPrId !== null; // any private event
            } else {
              passPR = evPrId !== null && prSet.has(evPrId);
            }
          }

          // If both scopes enabled, union; if only one, use that; if none, show nothing
          if (useWS && usePR) return passWS || passPR;
          if (useWS) return passWS;
          if (usePR) return passPR;

          return false;
        });
      },
    }),
    {
      name: 'wm-calendar-store',
      partialize: (state) => ({
        view: state.view,
        filters: state.filters,
        // persist selections so the sidebar feels sticky
        selectedWorkspaceIds: state.selectedWorkspaceIds,
        showAllWorkspaces: state.showAllWorkspaces,
        selectedPrivateSpaceIds: state.selectedPrivateSpaceIds,
        showAllPrivateSpaces: state.showAllPrivateSpaces,
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