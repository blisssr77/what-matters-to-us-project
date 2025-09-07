import { useEffect, useMemo, useCallback } from 'react';
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

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(isBetween);

export default function WCalendarPage() {
  // --- pull the real fields from the Zustand store
  const view        = useCalendarStore(s => s.view);
  const range       = useCalendarStore(s => s.range);      // { from, to } (ISO or null)
  const setRange    = useCalendarStore(s => s.setRange);
  const events      = useCalendarStore(s => s.events);
  const setEvents   = useCalendarStore(s => s.setEvents);

  const { filters } = useCalendarFilters();

  // ---- derive a safe range (prevents .startOf on undefined) -----------------
  const { safeStart, safeEnd } = useMemo(() => {
    const now = dayjs();
    const start = range?.from ? dayjs(range.from) : now.startOf('week');
    const end   = range?.to   ? dayjs(range.to)   : start.endOf('week');
    return { safeStart: start, safeEnd: end };
  }, [range]);

  // ---- navigation handlers (today / prev / next) ----------------------------
  const goToWeek = useCallback((anchor) => {
    const start = dayjs(anchor).startOf('week');
    const end   = start.endOf('week');
    setRange({ from: start.toISOString(), to: end.toISOString() });
  }, [setRange]);

  const onToday = useCallback(() => goToWeek(dayjs()), [goToWeek]);
  const onPrev  = useCallback(() => goToWeek(safeStart.subtract(1, 'week')), [goToWeek, safeStart]);
  const onNext  = useCallback(() => goToWeek(safeStart.add(1, 'week')),       [goToWeek, safeStart]);

  // ---- fetch items whenever range / filters change --------------------------
  useEffect(() => {
    let cancelled = false;

    async function fetchAll() {
      const tz = dayjs.tz.guess(); // e.g. "America/Los_Angeles"
      const startISO = safeStart.tz(tz).startOf('day').toISOString();
      const endISO   = safeEnd.tz(tz).endOf('day').toISOString();

      const collected = [];

      // Workspace items — overlap predicate
      if (filters.includeWorkspace) {
        const { data, error } = await supabase
          .from('workspace_calendar_items_secure')
          .select('*')
          .lt('start_at', endISO)
          .or(`end_at.is.null,end_at.gte.${startISO}`);

        if (!error && data) {
          collected.push(
            data.map(r => ({
              ...r,
              scope: 'workspace',
              color: r.calendar_color || '#2563eb',
            }))
          );
        }
      }

      // Private items — same overlap
      if (filters.includePrivate) {
        const { data, error } = await supabase
          .from('private_calendar_items_secure')
          .select('*')
          .lt('start_at', endISO)
          .or(`end_at.is.null,end_at.gte.${startISO}`);

        if (!error && data) {
          collected.push(
            data.map(r => ({
              ...r,
              scope: 'private',
              color: r.calendar_color || '#7c3aed',
            }))
          );
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
    setEvents,
  ]);

  // ---- simple client-side filtering ------------------------------
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
      <div className="h-full grid grid-cols-[280px_1fr]">
        {/* Left rail */}
        <aside className="border-r bg-white">
          <CalendarSidebar />
        </aside>

        {/* Main column */}
        <section className="flex flex-col min-w-0">
          <CalendarToolbar onToday={onToday} onPrev={onPrev} onNext={onNext} />

          <div className="flex-1 min-h-0">
            <CalendarGridWeek
              startOfWeek={safeStart.startOf('week')}
              events={filteredItems}
            />
          </div>
        </section>
      </div>
    </Layout>
  );
}