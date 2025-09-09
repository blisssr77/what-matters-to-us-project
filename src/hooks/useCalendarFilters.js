import { useCallback, useMemo } from 'react';
import { useCalendarStore } from '@/store/useCalendarStore';

const slug = (s='') =>
  String(s).toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g,'').trim().replace(/\s+/g,'-');

export function useCalendarFilters() {
  const filters       = useCalendarStore(s => s.filters);
  const setFilters    = useCalendarStore(s => s.setFilters);
  const resetFilters  = useCalendarStore(s => s.resetFilters);
  const currentUserId = useCalendarStore(s => s.currentUserId);

  // basic setters
  const setSearch   = useCallback((search) => setFilters({ search }), [setFilters]);
  const setAssignee = useCallback((assigneeId) => setFilters({ assigneeId: assigneeId || null }), [setFilters]);
  const setStatuses = useCallback((statuses) => setFilters({ statuses: Array.isArray(statuses) ? statuses : [] }), [setFilters]);
  const setTagSlugs = useCallback((tagSlugs) => setFilters({ tagSlugs: Array.isArray(tagSlugs) ? tagSlugs.map(slug) : [] }), [setFilters]);
  const setMineOnly = useCallback((mineOnly) => setFilters({ mineOnly: !!mineOnly }), [setFilters]);

  // ✅ sources (the ones your sidebar calls)
  const setIncludeWorkspace = useCallback(
    (val) => setFilters({ includeWorkspace: !!val }),
    [setFilters]
  );
  const setIncludePrivate = useCallback(
    (val) => setFilters({ includePrivate: !!val }),
    [setFilters]
  );

  // visibility (mutually exclusive)
  const setShowPublicOnly = useCallback(
    (val) => setFilters({
      showPublicOnly: !!val,
      showVaultedOnly: val ? false : !!filters.showVaultedOnly,
    }),
    [setFilters, filters.showVaultedOnly]
  );

  const setShowVaultedOnly = useCallback(
    (val) => setFilters({
      showVaultedOnly: !!val,
      showPublicOnly: val ? false : !!filters.showPublicOnly,
    }),
    [setFilters, filters.showPublicOnly]
  );

  // toggles/helpers
  const toggleStatus = useCallback((status) => {
    const cur = new Set(filters.statuses || []);
    cur.has(status) ? cur.delete(status) : cur.add(status);
    setFilters({ statuses: Array.from(cur) });
  }, [filters.statuses, setFilters]);

  const toggleTagName = useCallback((name) => {
    const key = slug(name);
    const cur = new Set(filters.tagSlugs || []);
    cur.has(key) ? cur.delete(key) : cur.add(key);
    setFilters({ tagSlugs: Array.from(cur) });
  }, [filters.tagSlugs, setFilters]);

  const setAssignedToMe = useCallback(() => {
    if (currentUserId) setAssignee(currentUserId);
  }, [currentUserId, setAssignee]);

  const setMine = useCallback(() => setMineOnly(true), [setMineOnly]);

  const isFiltered = useMemo(() => {
    const f = filters || {};
    return (
      !!f.search ||
      !!f.assigneeId ||
      (f.statuses?.length > 0) ||
      (f.tagSlugs?.length > 0) ||
      !!f.mineOnly ||
      !!f.showPublicOnly ||
      !!f.showVaultedOnly ||
      !f.includeWorkspace ||
      !f.includePrivate
    );
  }, [filters]);

  return {
    filters,
    isFiltered,

    // sources + visibility
    setIncludeWorkspace,
    setIncludePrivate,
    setShowPublicOnly,
    setShowVaultedOnly,

    // basics
    setSearch, setAssignee, setStatuses, setTagSlugs, setMineOnly, resetFilters,

    // toggles/helpers
    toggleStatus, toggleTagName, setAssignedToMe, setMine,
  };
}