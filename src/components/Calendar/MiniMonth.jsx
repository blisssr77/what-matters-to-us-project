import { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import dayjs from 'dayjs'
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react'

/**
 * Props
 * - month?: dayjs()               // starting month (default today)
 * - onDayClick?: (d: Dayjs) => void
 * - onMonthChange?: (m: Dayjs) => void
 */
export default function MiniMonth({
  month = dayjs(),
  onDayClick,
  onMonthChange,
}) {
  // local controlled month (normalized to 1st of month)
  const [curMonth, setCurMonth] = useState(month.startOf('month'))
  const [showPicker, setShowPicker] = useState(false)
  const popRef = useRef(null)

  // keep in sync if parent changes month prop
  useEffect(() => {
    setCurMonth(month.startOf('month'))
  }, [month])

  const start = useMemo(
    () => curMonth.startOf('month').startOf('week'),
    [curMonth]
  )
  const end = useMemo(
    () => curMonth.endOf('month').endOf('week'),
    [curMonth]
  )

  const days = useMemo(() => {
    const list = []
    let cur = start
    while (cur.isBefore(end) || cur.isSame(end, 'day')) {
      list.push(cur)
      cur = cur.add(1, 'day')
    }
    return list
  }, [start, end])

  // notify parent when visible month changes
  const emitMonthChange = useCallback((m) => {
    onMonthChange?.(m.startOf('month'))
  }, [onMonthChange])

  const goPrev = () => {
    const nxt = curMonth.subtract(1, 'month').startOf('month')
    setCurMonth(nxt)
    emitMonthChange(nxt)
  }
  const goNext = () => {
    const nxt = curMonth.add(1, 'month').startOf('month')
    setCurMonth(nxt)
    emitMonthChange(nxt)
  }

  // simple month-picker popover (year nav + 12 months)
  const [pickerYear, setPickerYear] = useState(curMonth.year())
  useEffect(() => setPickerYear(curMonth.year()), [curMonth])

  // close popover when clicking outside
  useEffect(() => {
    if (!showPicker) return
    const onClick = (e) => {
      if (!popRef.current) return
      if (!popRef.current.contains(e.target)) setShowPicker(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [showPicker])

  const monthsShort = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

  return (
    <div className="relative select-none">
      {/* Header */}
      <div className="flex items-center justify-between mb-2 text-sm font-medium text-gray-700">
        <button
          type="button"
          onClick={goPrev}
          className="rounded p-1 hover:bg-gray-100"
          aria-label="Previous month"
          title="Previous month"
        >
          <ChevronLeft size={16} />
        </button>

        <button
          type="button"
          onClick={() => setShowPicker((v) => !v)}
          className="inline-flex items-center gap-1 rounded px-2 py-1 hover:bg-gray-100"
          title="Jump to month"
        >
          <CalendarIcon size={14} />
          <span>{curMonth.format('MMMM YYYY')}</span>
        </button>

        <button
          type="button"
          onClick={goNext}
          className="rounded p-1 hover:bg-gray-100"
          aria-label="Next month"
          title="Next month"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Week headings */}
      <div className="grid grid-cols-7 gap-1 text-[11px] text-gray-500 mb-1">
        {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((d, i) => (
          <div key={`wd-${i}`} className="text-center">{d}</div>
        ))}
      </div>

      {/* Days grid */}
      <div className="grid grid-cols-7 gap-1">
        {days.map((d) => {
          const isToday = d.isSame(dayjs(), 'day')
          const isCurMonth = d.month() === curMonth.month()
          return (
            <button
              key={d.format('YYYY-MM-DD')}  // stable key
              onClick={() => onDayClick?.(d)}
              className={[
                'aspect-square rounded text-xs transition-colors',
                isToday
                  ? 'bg-blue-600 text-white'
                  : isCurMonth
                    ? 'hover:bg-gray-100 text-gray-800'
                    : 'text-gray-400 hover:bg-gray-50',
              ].join(' ')}
            >
              {d.date()}
            </button>
          )
        })}
      </div>

      {/* Month-picker popover */}
      {showPicker && (
        <div
          ref={popRef}
          className="absolute z-20 left-1/2 -translate-x-1/2 top-9 w-64 rounded border bg-white shadow-lg p-3"
        >
          <div className="flex items-center justify-between mb-2">
            <button
              type="button"
              className="rounded p-1 hover:bg-gray-100"
              onClick={() => setPickerYear((y) => y - 1)}
              title="Prev year"
            >
              <ChevronLeft size={16} />
            </button>
            <div className="text-sm font-semibold text-gray-700">{pickerYear}</div>
            <button
              type="button"
              className="rounded p-1 hover:bg-gray-100"
              onClick={() => setPickerYear((y) => y + 1)}
              title="Next year"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {monthsShort.map((m, idx) => {
              const picked = curMonth.year() === pickerYear && curMonth.month() === idx
              return (
                <button
                  key={`m-${idx}`}
                  type="button"
                  onClick={() => {
                    const next = dayjs().year(pickerYear).month(idx).startOf('month')
                    setCurMonth(next)
                    emitMonthChange(next)
                    setShowPicker(false)
                  }}
                  className={[
                    'text-xs rounded px-2 py-1 border transition-colors',
                    picked ? 'bg-blue-600 text-white border-blue-600'
                           : 'hover:bg-gray-100 border-gray-200 text-gray-700',
                  ].join(' ')}
                >
                  {m}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
