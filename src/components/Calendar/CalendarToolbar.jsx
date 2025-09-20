import dayjs from 'dayjs'
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Search } from 'lucide-react'
import  { useCalendarStore } from '@/store/useCalendarStore'
import { useCalendarFilters } from '@/hooks/useCalendarFilters'

export default function CalendarToolbar({ onToday, onPrev, onNext }) {
  const { filters, setSearch } = useCalendarFilters()
  const view     = useCalendarStore(s => s.view);
  const setView  = useCalendarStore(s => s.setView);
  const range    = useCalendarStore(s => s.range);
  const setRange = useCalendarStore(s => s.setRange);

  const periodFor = (v, anchor) => {
    const a = dayjs(anchor);
    if (v === 'day')   return { start: a.startOf('day'),   end: a.endOf('day') };
    if (v === 'month') return { start: a.startOf('month').startOf('week'), end: a.endOf('month').endOf('week') };
    return { start: a.startOf('week'), end: a.endOf('week') };
  };

  const anchor = range?.from ? dayjs(range.from) : dayjs();

  const rangeLabel = (() => {
    if (view === 'week') {
      const a = range?.from ? dayjs(range.from) : dayjs().startOf('week');
      const b = range?.to   ? dayjs(range.to)   : a.endOf('week');
      return a.format('MMM D') + ' – ' + (a.month() === b.month() ? b.format('D, YYYY') : b.format('MMM D, YYYY'))
    }
    if (view === 'day')   return (range?.from ? dayjs(range.from) : dayjs()).format('MMM D, YYYY');
    // month
    return (range?.from ? dayjs(range.from) : dayjs()).format('MMM YYYY');
  })()

  return (
    <div className="sticky top-0 z-10 bg-gray-100/80 backdrop-blur border-b">
      <div className="flex items-center gap-3 px-4 py-2">
        {/* Today + nav */}
        <button onClick={onToday} className="px-3 py-1.5 rounded border bg-white hover:bg-gray-50 text-xs text-gray-700">
          Today
        </button>
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
              onClick={() => {
               setView(v);
               const { start, end } = periodFor(v, anchor);
               setRange({ from: start.toISOString(), to: end.toISOString() });
             }}
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
