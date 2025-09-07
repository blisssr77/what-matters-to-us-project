import { useCallback, useMemo } from 'react';
import { useCalendarStore } from '@/store/useCalendarStore';

// keep slug logic identical to the store so filters match
const slug = (s = '') =>
  String(s)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');

/**
 * Centralized filters API for the calendar.
 * Works with the Zustand calendar store and gives you handy mutators,
 * toggles, URL sync helpers, and an isFiltered flag.
 */
export function useCalendarFilters() {
  const filters = useCalendarStore((s) => s.filters);
  const setFilters = useCalendarStore((s) => s.setFilters);
  const resetFilters = useCalendarStore((s) => s.resetFilters);
  const currentUserId = useCalendarStore((s) => s.currentUserId);

  // --- basic setters ---
  const setSearch = useCallback(
    (search) => setFilters({ search }),
    [setFilters]
  );

  const setAssignee = useCallback(
    (assigneeId) => setFilters({ assigneeId: assigneeId || null }),
    [setFilters]
  );

  const setStatuses = useCallback(
    (statuses) => setFilters({ statuses: Array.isArray(statuses) ? statuses : [] }),
    [setFilters]
  );

  const setTagSlugs = useCallback(
    (tagSlugs) =>
      setFilters({
        tagSlugs: Array.isArray(tagSlugs) ? tagSlugs.map((t) => slug(t)) : [],
      }),
    [setFilters]
  );

  const setMineOnly = useCallback(
    (mineOnly) => setFilters({ mineOnly: !!mineOnly }),
    [setFilters]
  );

  // --- toggles (nice for chips & dropdowns) ---
  const toggleStatus = useCallback(
    (status) => {
      const cur = new Set(filters.statuses || []);
      cur.has(status) ? cur.delete(status) : cur.add(status);
      setFilters({ statuses: Array.from(cur) });
    },
    [filters.statuses, setFilters]
  );

  const toggleTagName = useCallback(
    (name) => {
      const key = slug(name);
      const cur = new Set(filters.tagSlugs || []);
      cur.has(key) ? cur.delete(key) : cur.add(key);
      setFilters({ tagSlugs: Array.from(cur) });
    },
    [filters.tagSlugs, setFilters]
  );

  // quick helper: “Assigned to me” (uses currentUserId if available)
  const setAssignedToMe = useCallback(() => {
    if (!currentUserId) return;
    setAssignee(currentUserId);
  }, [currentUserId, setAssignee]);

  // quick helper: “Created by me”
  const setMine = useCallback(() => setMineOnly(true), [setMineOnly]);

  // --- URL sync helpers (optional) ---
  // serialize filters to a query object (for ?q=&assignee=&status=a,b&tags=x,y&mine=1)
  const toQuery = useCallback(() => {
    const q = {};
    if (filters.search) q.q = filters.search;
    if (filters.assigneeId) q.assignee = filters.assigneeId;
    if (filters.statuses?.length) q.status = filters.statuses.join(',');
    if (filters.tagSlugs?.length) q.tags = filters.tagSlugs.join(',');
    if (filters.mineOnly) q.mine = '1';
    return q;
  }, [filters]);

  // apply filters from URLSearchParams or a plain object
  const fromQuery = useCallback(
    (params) => {
      const get = (k) =>
        params instanceof URLSearchParams ? params.get(k) : params?.[k] ?? null;

      const q = get('q') || '';
      const assignee = get('assignee') || null;
      const statusCsv = get('status') || '';
      const tagsCsv = get('tags') || '';
      const mine = get('mine') === '1';

      setFilters({
        search: q,
        assigneeId: assignee || null,
        statuses: statusCsv ? statusCsv.split(',').filter(Boolean) : [],
        tagSlugs: tagsCsv ? tagsCsv.split(',').filter(Boolean).map(slug) : [],
        mineOnly: !!mine,
      });
    },
    [setFilters]
  );

  // --- convenience flags ---
  const isFiltered = useMemo(() => {
    const f = filters || {};
    return (
      !!f.search ||
      !!f.assigneeId ||
      !!(f.statuses && f.statuses.length) ||
      !!(f.tagSlugs && f.tagSlugs.length) ||
      !!f.mineOnly
    );
  }, [filters]);

  return {
    filters,
    isFiltered,

    // setters
    setSearch,
    setAssignee,
    setStatuses,
    setTagSlugs,
    setMineOnly,
    resetFilters,

    // toggles / quick actions
    toggleStatus,
    toggleTagName,
    setAssignedToMe,
    setMine,

    // URL sync
    toQuery,
    fromQuery,
  };
}

/**
 * Optional small debounced input helper.
 * Use for the search box so it doesn’t re-render the board on every keystroke.
 */
// export function useDebouncedSearch(setSearch, delay = 300) {
//   return useCallback {
//     let t;
//     return (val) => {
//       clearTimeout(t);
//       t = setTimeout(() => setSearch(val), delay);
//     };
//   }(setSearch, delay);
// }

export default { useCalendarFilters };
