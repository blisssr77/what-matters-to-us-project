import { useEffect, useMemo, useCallback, useState } from 'react';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import isBetween from 'dayjs/plugin/isBetween';

import Layout from '@/components/Layout/Layout';
import { supabase } from '@/lib/supabaseClient';
import { useCalendarStore } from '@/store/useCalendarStore';
import { useCalendarFilters } from '@/hooks/useCalendarFilters';
import CalendarToolbar from '@/components/Calendar/CalendarToolbar';
import CalendarSidebar from '@/components/Calendar/CalendarSidebar';
import CalendarGridWeek from '@/components/Calendar/CalendarGridWeek';
import CalendarGridDay from '@/components/Calendar/CalendarGridDay';
import CalendarGridMonth from '@/components/Calendar/CalendarGridMonth';
import EventQuickView from '@/components/Calendar/EventQuickView';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(isBetween);

export default function CalendarPage() {
  // --- pull the real fields from the Zustand store
  const view        = useCalendarStore(s => s.view);
  const range       = useCalendarStore(s => s.range);      // { from, to } (ISO or null)
  const setRange    = useCalendarStore(s => s.setRange);
  const events      = useCalendarStore(s => s.events);
  const setEvents   = useCalendarStore(s => s.setEvents);
  const anchorDate  = useCalendarStore(s => s.anchorDate);
  const setAnchorDate = useCalendarStore(s => s.setAnchorDate);

  const { filters } = useCalendarFilters();
  // subscribe to scope selections so queries refire
  const selectedWorkspaceIds    = useCalendarStore(s => s.selectedWorkspaceIds);
  const showAllWorkspaces       = useCalendarStore(s => s.showAllWorkspaces);
  const selectedPrivateSpaceIds = useCalendarStore(s => s.selectedPrivateSpaceIds);
  const showAllPrivateSpaces    = useCalendarStore(s => s.showAllPrivateSpaces);

  // --- navigation helpers
  const [quick, setQuick] = useState(null);
  const onEventClick = useCallback((e) => setQuick(e), []);
  const onCloseQuick = useCallback(() => setQuick(null), []);
  const canSeeVaulted = true;
  const anchor = range?.from ? dayjs(range.from) : dayjs();

  // ---- editing/navigation handlers (edit, route to editor) -------------
  const onEdit = useCallback((e) => {
    // route wherever your editor is; example:
    if (e.scope === 'workspace') {
      // e.id should be the workspace_vault_items id
      navigate(`/workspace/doc/${e.id}?from=calendar`);
    } else {
      navigate(`/private/doc/${e.id}?from=calendar`);
    }
  }, []);

  // ----------------- helper to compute start/end for a given view + anchor -----------------
  const periodFor = useCallback((v, anchor) => {
    const a = dayjs(anchor);
    if (v === 'day') {
      return { start: a.startOf('day'), end: a.endOf('day') };
    }
    if (v === 'month') {
      // month grid often wants the full matrix (sun–sat wrap)
      return { start: a.startOf('month').startOf('week'), end: a.endOf('month').endOf('week') };
    }
    // week
    return { start: a.startOf('week'), end: a.endOf('week') };
  }, []);

  // ----------------- derive a safe range (prevents .startOf on undefined) -----------------
  const { safeStart, safeEnd } = useMemo(() => {
    const now = dayjs();
    const start = range?.from ? dayjs(range.from) : now.startOf('week');
    const end   = range?.to   ? dayjs(range.to)   : start.endOf('week');
    return { safeStart: start, safeEnd: end };
  }, [range]);

  // ----------------- derive a monthAnchor (for month view, to highlight current month) -----------------
  const monthAnchor = useMemo(() => {
    if (!range?.from || !range?.to) return dayjs();
    const from = dayjs(range.from);
    const to = dayjs(range.to);
    return from.add(Math.floor(to.diff(from, 'day') / 2), 'day');
  }, [range]);

  // Active anchor for Month = selected anchorDate if set, else middle of range
  const activeMonthAnchor = useMemo(
    () => (anchorDate ? dayjs(anchorDate) : monthAnchor),
    [anchorDate, monthAnchor]
  );

  // ----------------- navigation handlers (today / prev / next) -----------------
  // navigate using current view
  const goTo = useCallback((anchor) => {
    const { start, end } = periodFor(view, anchor);
    setRange({ from: start.toISOString(), to: end.toISOString() });
  }, [periodFor, setRange, view]);

  const onToday = useCallback(() => goTo(dayjs()), [goTo]);
  // currentAnchor is the date we move forward/back from; depends on view
  const currentAnchor = useMemo(() => {
    if (anchorDate) return dayjs(anchorDate)
    if (!range?.from || !range?.to) return dayjs()
    // middle of range is a safe fallback
    const a = dayjs(range.from), b = dayjs(range.to)
    return a.add(Math.floor(b.diff(a, 'day') / 2), 'day')
  }, [anchorDate, range])

  const onPrev = useCallback(() => {
    const a =
      view === 'day'   ? currentAnchor.subtract(1, 'day')
      : view === 'month' ? currentAnchor.subtract(1, 'month')
      : currentAnchor.subtract(1, 'week');
      setAnchorDate(a.toISOString())
    const { start, end } = periodFor(view, a)
    setRange({ from: start.toISOString(), to: end.toISOString() })
  }, [view, currentAnchor, setAnchorDate, setRange])


  const onNext = useCallback(() => {
    const a =
      view === 'day'   ? currentAnchor.add(1, 'day')
      : view === 'month' ? currentAnchor.add(1, 'month')
      : currentAnchor.add(1, 'week');
    if (view === 'month') setAnchorDate(a.toISOString());
    goTo(a);
  }, [goTo, currentAnchor, view]);

  // ------------------------------ keep range in sync when view changes --------------------------
  useEffect(() => {
    const a = view === 'month' ? activeMonthAnchor : safeStart;
    const { start, end } = periodFor(view, a);
    const same =
      range?.from && range?.to &&
      dayjs(range.from).isSame(start) &&
      dayjs(range.to).isSame(end);
    if (!same) setRange({ from: start.toISOString(), to: end.toISOString() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  // ------------------------------ fetch items whenever range / filters change --------------------------
  useEffect(() => {
    let cancelled = false;

    async function fetchAll() {
      const tz = dayjs.tz.guess(); // e.g. "America/Los_Angeles"
      const startISO = safeStart.tz(tz).startOf('day').toISOString();
      const endISO   = safeEnd.tz(tz).endOf('day').toISOString();
      const collected = [];

      // WORKSPACE items (filtered by selection)
      if (filters.includeWorkspace) {
        let q = supabase
          .from('workspace_calendar_items_secure')
          .select('*')
          .lt('start_at', endISO)
          .or(`end_at.is.null,end_at.gte.${startISO}`);

        if (!showAllWorkspaces && selectedWorkspaceIds.length) {
          q = q.in('workspace_id', selectedWorkspaceIds);
        }

        const { data, error } = await q;
        if (!error && Array.isArray(data)) {
          collected.push(
            data.map(r => ({
              ...r,
              scope: 'workspace',
              color: r.calendar_color || '#2563eb',
            }))
          );
        } else if (error) {
          console.error('workspace query error:', error);
        }
      }

      // PRIVATE items (filtered by selection)
      if (filters.includePrivate) {
        let q = supabase
          .from('private_calendar_items_secure')
          .select('*')
          .lt('start_at', endISO)
          .or(`end_at.is.null,end_at.gte.${startISO}`);

        if (!showAllPrivateSpaces && selectedPrivateSpaceIds.length) {
          q = q.in('private_space_id', selectedPrivateSpaceIds);
        }

        const { data, error } = await q;
        if (!error && Array.isArray(data)) {
          collected.push(
            data.map(r => ({
              ...r,
              scope: 'private',
              color: r.calendar_color || '#7c3aed',
            }))
          );
        } else if (error) {
          console.error('private query error:', error);
        }
      }

      if (!cancelled) setEvents(collected.flat());
    }

    fetchAll();
    return () => { cancelled = true; };
  }, [
    safeStart.valueOf(),
    safeEnd.valueOf(),
    filters.includePrivate,
    filters.includeWorkspace,
    selectedWorkspaceIds,
    showAllWorkspaces,
    selectedPrivateSpaceIds,
    showAllPrivateSpaces,
    setEvents,
  ]);

  // ------------------------------ simple client-side filtering ------------------------------
  const filteredItems = useMemo(() => {
    const q = (filters.search || '').toLowerCase().trim()
    const tagSet = new Set(filters.tags || [])
    return (events || []).filter(ev => {
        // NEW: public-only filter
        if (filters.showPublicOnly && ev.is_vaulted) return false
        // Existing: vaulted-only
        if (filters.showVaultedOnly && !ev.is_vaulted) return false

        if (q) {
          const hay = `${ev.title || ''} ${(ev.tags || []).join(',')}`.toLowerCase()
          if (!hay.includes(q)) return false
        }
        if (tagSet.size) {
          const evTags = new Set(ev.tags || [])
          for (const t of tagSet) if (!evTags.has(t)) return false
        }
        return true
    })
    }, [events, filters])

  return (
    <Layout noGutters contentBg="bg-gray-100">
      <div className="h-full grid grid-cols-[220px_1fr]">
        {/* Left sidebar */}
        <aside className="border-r bg-white">
          <CalendarSidebar />
        </aside>

        {/* Main column */}
        <section className="flex flex-col min-w-0">
          <CalendarToolbar onToday={onToday} onPrev={onPrev} onNext={onNext} />

          <div className="flex-1 min-h-0">
            {/* Calendar grids weekStart on safeStart */}
            {/* week view */}
            {view === 'week' && (
              <CalendarGridWeek
                startOfWeek={safeStart.startOf('week')}
                events={filteredItems}
                onEventClick={setQuick}
              />
            )}
            {/* single day view */}
            {view === 'day' && (
              <CalendarGridDay
                date={safeStart}                // safeStart is already at current anchor
                events={filteredItems}
                onEventClick={setQuick}
              />
            )}
            {/* month view */}
            {view === 'month' && (
              <CalendarGridMonth
                monthStart={activeMonthAnchor.startOf('month')}
                events={filteredItems}
                onDayClick={(d) => {
                  const dd = dayjs(d);
                  setAnchorDate(dd.toISOString());
                  const start = dd.startOf('month').startOf('week');
                  const end   = dd.endOf('month').endOf('week');
                  setRange({ from: start.toISOString(), to: end.toISOString() });
                }}
                onEventClick={setQuick}
                selectedDate={activeMonthAnchor}
              />
            )}
          </div>
        </section>
      </div>

      {/* Quick view modal */}
      {quick && (
        <EventQuickView
          event={quick}
          canSeeVaulted={canSeeVaulted}
          onClose={() => setQuick(null)}
          onEdit={() => { setQuick(null); }}
        />
      )}
    </Layout>
  );
}