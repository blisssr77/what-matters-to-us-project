import dayjs from 'dayjs'
import { Plus } from 'lucide-react'
import MiniMonth from './MiniMonth'
import WorkspaceSelect from './WorkspaceSelect'
import { useCalendarStore } from '@/store/useCalendarStore'
import { useCalendarFilters } from '@/hooks/useCalendarFilters'
import { useState, useEffect } from 'react'

export default function CalendarSidebar() {
  const { filters, setIncludeWorkspace, setIncludePrivate, setShowPublicOnly, setShowVaultedOnly } = useCalendarFilters()

  // pull/set the range from your store
  const visibleStart = useCalendarStore(s => s.range.from)
  const setRange      = useCalendarStore(s => s.setRange)
  const setView       = useCalendarStore(s => s.setView)

  // local month follows store start or today
  const [month, setMonth] = useState(dayjs())

  useEffect(() => {
    // If your range stores ISO strings, convert to dayjs
    const base = visibleStart ? dayjs(visibleStart) : dayjs()
    setMonth(base.startOf('month'))
  }, [visibleStart])

  // When a day is clicked → jump week in grid
  const handleDayClick = (d) => {
    const start = d.startOf('week')
    const end   = d.endOf('week')
    setView('timeGridWeek')
    setRange({ from: start.toISOString(), to: end.toISOString() })
  }

  return (
    <div className="h-full flex flex-col">
      <div className="p-3 border-b">
        <div className="p-3 space-y-3 overflow-y-auto">
          <WorkspaceSelect
            includeWorkspace={!!filters.includeWorkspace}
            includePrivate={!!filters.includePrivate}
            onChangeWorkspace={setIncludeWorkspace}
            onChangePrivate={setIncludePrivate}
          />
        </div>

        <button className="w-full inline-flex items-center justify-center gap-2 rounded bg-blue-600 hover:bg-blue-700 text-white py-2 text-sm">
          <Plus size={16}/> Create
        </button>
      </div>

      <div className="p-3 border-b">
        <MiniMonth
          month={month}
          onDayClick={handleDayClick}
          onMonthChange={setMonth}
        />
      </div>
      <div className="p-3 space-y-3 overflow-y-auto">
        <h4 className="text-xs font-semibold text-gray-500 uppercase">My calendars</h4>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={!!filters.includeWorkspace}
            onChange={(e)=>setIncludeWorkspace(e.target.checked)}
          />
          Workspace
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={!!filters.includePrivate}
            onChange={(e)=>setIncludePrivate(e.target.checked)}
          />
          My Private
        </label>
      </div>

      <div className="p-3 space-y-3 overflow-y-auto">
        <h4 className="text-xs font-semibold text-gray-500 uppercase">Options</h4>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={!!filters.showPublicOnly}
            onChange={(e)=>setShowPublicOnly(e.target.checked)}
          />
          Public only
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={!!filters.showVaultedOnly}
            onChange={(e)=>setShowVaultedOnly(e.target.checked)}
          />
          Vaulted only
        </label>
      </div>
    </div>
  )
}