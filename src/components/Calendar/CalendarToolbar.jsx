import dayjs from 'dayjs'
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Search } from 'lucide-react'
import  { useCalendarStore } from '@/store/useCalendarStore'
import { useCalendarFilters } from '@/hooks/useCalendarFilters'

export default function CalendarToolbar({ onToday, onPrev, onNext }) {
  const { view, setView, visibleStart, visibleEnd } = useCalendarStore()
  const { filters, setSearch } = useCalendarFilters()

  const rangeLabel = (() => {
    if (view === 'week') {
      const a = dayjs(visibleStart)
      const b = dayjs(visibleEnd)
      return a.format('MMM D') + ' – ' + (a.month() === b.month() ? b.format('D, YYYY') : b.format('MMM D, YYYY'))
    }
    return dayjs(visibleStart).format('MMM YYYY')
  })()

  return (
    <div className="sticky top-0 z-10 bg-gray-100/80 backdrop-blur border-b">
      <div className="flex items-center gap-3 px-4 py-2">
        {/* Today + nav */}
        <button onClick={onToday} className="px-3 py-1.5 rounded border bg-white hover:bg-gray-50 text-xs text-gray-700">Today</button>
        <div className="flex items-center">
          <button onClick={onPrev} className="p-1.5 rounded border bg-white hover:bg-gray-50 text-xs text-gray-700"><ChevronLeft size={16} /></button>
          <button onClick={onNext} className="ml-2 p-1.5 rounded border bg-white hover:bg-gray-50 text-xs text-gray-700"><ChevronRight size={16} /></button>
        </div>

        {/* Range */}
        <div className="text-md font-bold text-gray-800">{rangeLabel}</div>

        {/* spacer */}
        <div className="flex-1" />

        {/* search */}
        <div className="relative">
          <Search size={16} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-700" />
          <input
            value={filters.search || ''}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search"
            className="pl-8 pr-3 py-1.5 rounded border bg-white text-xs w-52 focus:outline-none text-gray-700"
          />
        </div>

        {/* view switch */}
        <div className="ml-2 inline-flex rounded border bg-white overflow-hidden text-gray-700">
          {['day','week','month'].map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3 py-1.5 text-xs ${view===v ? 'bg-gray-900 text-white' : 'hover:bg-gray-50'}`}
            >
              {v[0].toUpperCase()+v.slice(1)}
            </button>
          ))}
        </div>

        {/* calendar icon – future quick-create */}
        <button className="ml-2 p-2 rounded border bg-white hover:bg-gray-50 text-gray-700">
          <CalendarIcon size={15} />
        </button>
      </div>
    </div>
  )
}
