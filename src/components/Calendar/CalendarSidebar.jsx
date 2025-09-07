import dayjs from 'dayjs'
import { Plus } from 'lucide-react'
import { useCalendarFilters } from '@/hooks/useCalendarFilters'
import MiniMonth from './MiniMonth'

export default function CalendarSidebar() {
  const {
    filters,
    setIncludeWorkspace,
    setIncludePrivate,
    setShowVaultedOnly,
  } = useCalendarFilters()

  return (
    <div className="h-full flex flex-col">
      <div className="p-3 border-b">
        <button className="w-full inline-flex items-center justify-center gap-2 rounded bg-blue-600 hover:bg-blue-700 text-white py-2 text-sm">
          <Plus size={16}/> Create
        </button>
      </div>

      <div className="p-3 border-b">
        <MiniMonth
          month={dayjs()}         // today
          onDayClick={() => {}}   // hook up later to jump range
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

        <h4 className="mt-4 text-xs font-semibold text-gray-500 uppercase">Options</h4>
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
