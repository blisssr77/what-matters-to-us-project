import dayjs from 'dayjs'

const HOUR_PX = 64   // grid height per hour

function minutesSinceMidnight(d) {
  const m = d.hour()*60 + d.minute()
  return m
}

export default function CalendarGridWeek({ startOfWeek, events }) {
  const days = [...Array(7)].map((_,i) => startOfWeek.add(i,'day'))
  const allDay = (events || []).filter(e => e.all_day)
  const timed  = (events || []).filter(e => !e.all_day)

  return (
    <div className="h-full flex flex-col">
      {/* header row with day labels */}
      <div className="grid grid-cols-[64px_repeat(7,1fr)] border-b bg-white">
        <div className="h-10" />
        {days.map(d => (
          <div key={d.toString()} className="h-10 px-3 flex items-center border-l">
            <div className="text-sm font-medium">
              {d.format('ddd D')}
            </div>
          </div>
        ))}
      </div>

      {/* all-day row */}
      <div className="grid grid-cols-[64px_repeat(7,1fr)] border-b bg-white">
        <div className="px-2 py-2 text-xs text-gray-500">All-day</div>
        {days.map((d, idx) => (
          <div key={idx} className="relative h-10 border-l">
            {allDay
              .filter(e => dayjs(e.start_at).isSame(d,'day'))
              .map(e => (
                <div
                  key={e.id}
                  className="absolute inset-y-1 left-1 right-1 rounded px-2 text-xs font-medium text-white"
                  style={{ background: e.color || '#2563eb' }}
                  title={e.title}
                >
                  {e.title}
                </div>
              ))}
          </div>
        ))}
      </div>

      {/* time grid */}
      <div className="flex-1 min-h-0 grid grid-cols-[64px_repeat(7,1fr)] overflow-auto bg-white">
        {/* hour gutter */}
        <div className="relative">
          {[...Array(24)].map((_,h) => (
            <div key={h} className="h-[64px] border-b text-[11px] text-right pr-2 text-gray-400">
              {h === 0 ? '' : dayjs().hour(h).minute(0).format('h A')}
            </div>
          ))}
        </div>

        {/* day columns */}
        {days.map((d, dayIdx) => (
          <div key={dayIdx} className="relative border-l">
            {/* grid lines */}
            {[...Array(24)].map((_,h) => (
              <div key={h} className="h-[64px] border-b" />
            ))}

            {/* events */}
            {timed
              .filter(e => dayjs(e.start_at).isSame(d,'day'))
              .map(e => {
                const start = dayjs(e.start_at)
                const end   = dayjs(e.end_at || e.start_at).add(30,'minute')
                const top   = (minutesSinceMidnight(start) / 60) * HOUR_PX
                const height = Math.max(28, ((end.diff(start,'minute')) / 60) * HOUR_PX)
                return (
                  <div
                    key={e.id}
                    className="absolute left-1 right-1 rounded px-2 py-1 text-xs font-medium text-white shadow"
                    style={{ top, height, background: e.color || '#2563eb' }}
                    title={e.title}
                  >
                    <div className="truncate">{e.title}</div>
                    <div className="opacity-80 text-[10px]">
                      {start.format('h:mm a')} – {end.format('h:mm a')}
                    </div>
                  </div>
                )
              })}
          </div>
        ))}
      </div>
    </div>
  )
}
