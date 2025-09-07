import { useEffect, useMemo } from 'react'
import dayjs from 'dayjs'
import Layout from '@/components/Layout/Layout'
import { supabase } from '@/lib/supabaseClient'
import { useCalendarStore } from '@/store/useCalendarStore'
import { useCalendarFilters } from '@/hooks/useCalendarFilters'
import CalendarToolbar from '@/components/Calendar/CalendarToolbar'
import CalendarSidebar from '@/components/Calendar/CalendarSidebar'
import CalendarGridWeek from '@/components/Calendar/CalendarGridWeek'

export default function WCalendarPage() {
  const {
    view,            // 'week' | 'day' | 'month' (week is implemented below)
    visibleStart,    // dayjs()
    visibleEnd,      // dayjs()
    items,           // unified array of events
    setItems,
    today, next, prev,
  } = useCalendarStore()

  const { filters } = useCalendarFilters()

  // ---- fetch items whenever range / filters change
  useEffect(() => {
    let cancelled = false

    async function fetchAll() {
      const startISO = visibleStart.startOf('day').toISOString()
      const endISO   = visibleEnd.endOf('day').toISOString()

      const buckets = []

      // Workspace items
      if (filters.includeWorkspace) {
        const { data, error } = await supabase
          .from('workspace_calendar_items_secure') // view you created
          .select('*')
          .gte('start_at', startISO)
          .lte('start_at', endISO)

        if (!error && data) {
          buckets.push(
            data.map(r => ({
              ...r,
              scope: 'workspace',
              color: r.calendar_color || '#2563eb',
            }))
          )
        }
      }

      // Private items
      if (filters.includePrivate) {
        const { data, error } = await supabase
          .from('private_calendar_items_secure') // companion view for private space
          .select('*')
          .gte('start_at', startISO)
          .lte('start_at', endISO)

        if (!error && data) {
          buckets.push(
            data.map(r => ({
              ...r,
              scope: 'private',
              color: r.calendar_color || '#7c3aed',
            }))
          )
        }
      }

      if (!cancelled) setItems(buckets.flat())
    }

    fetchAll()
    return () => { cancelled = true }
  }, [visibleStart, visibleEnd, filters.includePrivate, filters.includeWorkspace, setItems])

  // ---- simple client-side filtering: vaulted, tags, search
  const filteredItems = useMemo(() => {
    const q = (filters.search || '').toLowerCase().trim()
    const tagSet = new Set(filters.tags || [])
    return (items || []).filter(ev => {
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
  }, [items, filters])

  return (
    <Layout noGutters contentBg="bg-gray-100">
      <div className="h-full grid grid-cols-[280px_1fr]">
        {/* Left rail */}
        <aside className="border-r bg-white">
          <CalendarSidebar />
        </aside>

        {/* Main column */}
        <section className="flex flex-col min-w-0">
          <CalendarToolbar
            onToday={today}
            onPrev={prev}
            onNext={next}
          />

          {/* Only week grid provided here (day/month can be added later) */}
          <div className="flex-1 min-h-0">
            <CalendarGridWeek
              startOfWeek={dayjs(visibleStart).startOf('week')}
              events={filteredItems}
            />
          </div>
        </section>
      </div>
    </Layout>
  )
}
