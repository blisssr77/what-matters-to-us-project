import dayjs from 'dayjs'

export default function MiniMonth({ month = dayjs(), onDayClick }) {
  const start = month.startOf('month').startOf('week')
  const end   = month.endOf('month').endOf('week')
  const days = []
  let cur = start
  while (cur.isBefore(end) || cur.isSame(end, 'day')) {
    days.push(cur)
    cur = cur.add(1,'day')
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2 text-sm font-medium text-gray-700">
        <div>{month.format('MMMM YYYY')}</div>
      </div>
      <div className="grid grid-cols-7 gap-1 text-[11px] text-gray-500 mb-1">
        {['S','M','T','W','T','F','S'].map(d => <div key={d} className="text-center">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map(d => {
          const isToday = d.isSame(dayjs(), 'day')
          const isCurMonth = d.month() === month.month()
          return (
            <button
              key={d.toString()}
              onClick={() => onDayClick?.(d)}
              className={
                'aspect-square rounded text-xs ' +
                (isToday ? 'bg-blue-600 text-white' :
                 isCurMonth ? 'hover:bg-gray-100 text-gray-800' : 'text-gray-400 hover:bg-gray-50')
              }
            >
              {d.date()}
            </button>
          )
        })}
      </div>
    </div>
  )
}
