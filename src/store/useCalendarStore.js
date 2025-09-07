import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// tiny helper so tag filters work whether you pass "Design" or "design"
const slug = (s = '') =>
  String(s)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');

const defaultFilters = {
  search: '',
  assigneeId: null,       // string | null
  statuses: [],           // e.g. ['in_progress','blocked']
  tagSlugs: [],           // array of lower/slugged tag names
  mineOnly: false,        // only events where created_by === currentUserId
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

      // ---------- Workspace filtering for calendar ----------
      selectedWorkspaceIds: [],        // array of workspace IDs (strings)
      showAllWorkspaces: true,         // when true, ignore selectedWorkspaceIds

      setSelectedWorkspaceIds: (ids = []) => set({
        selectedWorkspaceIds: Array.from(new Set(ids.map(String))),
        showAllWorkspaces: ids.length === 0 ? true : false,
      }),
      toggleWorkspaceId: (id) => {
        const cur = new Set(get().selectedWorkspaceIds.map(String));
        const key = String(id);
        if (cur.has(key)) cur.delete(key);
        else cur.add(key);
        set({
          selectedWorkspaceIds: Array.from(cur),
          showAllWorkspaces: cur.size === 0 ? true : false,
        });
      },
      setShowAllWorkspaces: (flag) => set({
        showAllWorkspaces: !!flag,
        ...(flag ? { selectedWorkspaceIds: [] } : null),
      }),

      // ---------- Derived helpers ----------
      // Returns events filtered by current filters; call inside a component:
      // const events = useCalendarStore(selectFilteredEvents);
      _filterEvents: () => {
        const { events, filters, currentUserId } = get();
        const s = slug(filters.search || '');

        return events.filter((ev) => {
          const x = ev.extendedProps || {};
          const title = String(ev.title || '');
          const titleMatch = s ? slug(title).includes(s) : true;

          // assignee
          const assigneeOk = filters.assigneeId
            ? String(x.assignee_id || '') === String(filters.assigneeId)
            : true;

          // status
          const statusOk =
            filters.statuses && filters.statuses.length
              ? filters.statuses.includes(x.status)
              : true;

          // tags: expect x.tags as text[]; compare via slug
          const tagOk =
            filters.tagSlugs && filters.tagSlugs.length
              ? (Array.isArray(x.tags)
                  ? x.tags.map(slug).some((tg) => filters.tagSlugs.includes(tg))
                  : false)
              : true;

          // mineOnly
          const mineOk = filters.mineOnly
            ? currentUserId && String(x.created_by || '') === String(currentUserId)
            : true;

          return titleMatch && assigneeOk && statusOk && tagOk && mineOk;
        });
      },
    }),
    {
      name: 'wm-calendar-store', // localStorage key
      partialize: (state) => ({
        view: state.view,
        filters: state.filters,
        selectedWorkspaceIds: state.selectedWorkspaceIds,
        showAllWorkspaces: state.showAllWorkspaces,
      }),
    }
  )
);

// Selector that returns filtered events (memo-friendly with Zustand)
export const selectFilteredEvents = (state) => state._filterEvents();

// Convenience selectors
export const selectRange = (state) => state.range;
export const selectView = (state) => state.view;
export const selectFilters = (state) => state.filters;
export const selectLoading = (state) => state.loading;
export const selectError = (state) => state.error;
export const selectSelectedEventId = (state) => state.selectedEventId;
