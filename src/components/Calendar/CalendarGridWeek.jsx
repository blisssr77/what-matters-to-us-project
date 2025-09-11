import dayjs from 'dayjs'

const HOUR_PX = 64;

// ---------- helpers ----------
const minsSinceMidnight = (d) => d.hour() * 60 + d.minute();

function clipToDay(start, end, day) {
  const dayStart = day.startOf('day');
  const dayEnd   = day.endOf('day');
  const s = start.isAfter(dayStart) ? start : dayStart;
  const e = end && end.isBefore(dayEnd) ? end : dayEnd;
  return { s, e };
}

// 1) existing: split a continuous range into day-sized segments
function splitIntoDaySegments(e, weekStart) {
  const start = dayjs(e.start_at);
  const end   = e.end_at ? dayjs(e.end_at) : start.add(30, 'minute');
  const segments = [];

  for (let i = 0; i < 7; i++) {
    const d = weekStart.add(i, 'day');
    if (start.isBefore(d.endOf('day')) && end.isAfter(d.startOf('day'))) {
      const { s, e } = clipToDay(start, end, d);
      segments.push({
        dayIndex: i,
        segStart: s,
        segEnd: e,
      });
    }
  }
  return segments;
}

// 2) daily window explicit (from DB/UI fields)
function buildDailyWindowSegments(e, weekStart) {
  const firstDay = dayjs(e.start_at).startOf('day');
  const untilDay = dayjs(e.calendar_repeat_until || e.end_at || e.start_at).startOf('day');
  const startHM = e.calendar_window_start; // 'HH:mm'
  const endHM   = e.calendar_window_end;   // 'HH:mm'

  const segments = [];
  for (let i = 0; i < 7; i++) {
    const d = weekStart.add(i, 'day');
    if (d.isBefore(firstDay, 'day') || d.isAfter(untilDay, 'day')) continue;

    const segStart = dayjs(`${d.format('YYYY-MM-DD')} ${startHM}`);
    const segEnd   = dayjs(`${d.format('YYYY-MM-DD')} ${endHM}`);
    segments.push({ dayIndex: i, segStart, segEnd });
  }
  return segments;
}

// 3) daily window inferred (fallback when event spans multiple days but
//    you don't yet persist calendar_window_*). Uses start/end clocks.
function buildDailyWindowFromRange(e, weekStart) {
  const start = dayjs(e.start_at);
  const end   = dayjs(e.end_at);
  const startHM = start.format('HH:mm');
  const endHM   = end.format('HH:mm');

  const firstDay = start.startOf('day');
  const lastDay  = end.startOf('day');

  const segments = [];
  for (let i = 0; i < 7; i++) {
    const d = weekStart.add(i, 'day');
    if (d.isBefore(firstDay, 'day') || d.isAfter(lastDay, 'day')) continue;

    const segStart = dayjs(`${d.format('YYYY-MM-DD')} ${startHM}`);
    const segEnd   = dayjs(`${d.format('YYYY-MM-DD')} ${endHM}`);

    segments.push({ dayIndex: i, segStart, segEnd });
  }
  return segments;
}

// Dispatcher
function buildSegmentsForEvent(e, weekStart) {
  const hasExplicitDaily =
    e.calendar_repeat === 'daily' &&
    e.calendar_window_start &&
    e.calendar_window_end;

  if (hasExplicitDaily) {
    return buildDailyWindowSegments(e, weekStart);
  }

  const hasMultiDayRange =
    !e.all_day && e.end_at && dayjs(e.end_at).startOf('day').diff(dayjs(e.start_at).startOf('day'), 'day') >= 1;

  if (hasMultiDayRange) {
    return buildDailyWindowFromRange(e, weekStart);
  }

  return splitIntoDaySegments(e, weekStart);
}

export default function CalendarGridWeek({ startOfWeek, events = [], onEventClick }) {
  const weekStart = dayjs(startOfWeek);
  const days = [...Array(7)].map((_, i) => weekStart.add(i, 'day'));

  const allDay = events.filter(e => e.all_day);
  const timed  = events.filter(e => !e.all_day);

  return (
    <div className="h-full flex flex-col">
      {/* header */}
      <div className="grid grid-cols-[64px_repeat(7,1fr)] border-b bg-white sticky top-0 z-1 text-gray-600">
        <div className="h-10" />
        {days.map(d => (
          <div key={d.format('YYYY-MM-DD')} className="h-10 px-3 flex items-center border-l">
            <div className="text-sm font-medium">
              {d.format('ddd D')}
            </div>
          </div>
        ))}
      </div>

      {/* all-day row (supports spans) */}
      <div className="grid grid-cols-[64px_repeat(7,1fr)] border-b bg-white">
        <div className="px-2 py-2 text-xs text-gray-500">All-day</div>
        {/* we’ll render positioned chips that span columns */}
        <div className="col-span-7 relative min-h-10">
          {allDay.map(e => {
            const start = dayjs(e.start_at);
            const end   = e.end_at ? dayjs(e.end_at) : start;
            // find first/last day indexes
            const first = Math.max(0, start.diff(weekStart.startOf('day'), 'day'));
            const last  = Math.min(6, end.diff(weekStart.startOf('day'), 'day'));
            const colStart = 1 + first;         // grid column index inside 7 cols
            const span     = Math.max(1, last - first + 1);

            return (
              <div
                key={`allday-${e.id}`}
                className="absolute left-0 right-0 px-1"
                style={{ top: 4 + (e._rowIndex || 0) * 28 }}  // simple stacking row; optional
              >
                <div
                  onClick={() => onEventClick?.(e)}
                  className="text-xs font-medium text-white rounded px-2 py-1 cursor-pointer"
                  style={{
                    background: e.color || '#2563eb',
                    gridColumn: `${colStart} / span ${span}`,
                  }}
                >
                  {e.title}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* time grid */}
      <div className="flex-1 min-h-0 grid grid-cols-[64px_repeat(7,1fr)] overflow-auto bg-white">
        {/* hour gutter */}
        <div className="relative">
          {[...Array(24)].map((_, h) => (
            <div key={h} className="h-[64px] border-b text-[11px] text-right pr-2 text-gray-400">
              {h === 0 ? '' : dayjs().hour(h).minute(0).format('h A')}
            </div>
          ))}
        </div>

        {/* day columns */}
        {days.map((d, dayIdx) => (
          <div key={d.format('YYYY-MM-DD')} className="relative border-l">
            {[...Array(24)].map((_, h) => (
              <div key={h} className="h-[64px] border-b" />
            ))}

            {/* timed segments for this day */}
            {timed.flatMap(e => {
              const segs = buildSegmentsForEvent(e, weekStart);
              return segs
                .filter(s => s.dayIndex === dayIdx)
                .map(s => {
                  const top = (minsSinceMidnight(s.segStart) / 60) * HOUR_PX;
                  const heightMin = Math.max(1, s.segEnd.diff(s.segStart, 'minute'));
                  const height = Math.max(28, (heightMin / 60) * HOUR_PX);

                  return (
                    <div
                      key={`${e.id}-${dayIdx}-${s.segStart.valueOf()}`}
                      onClick={() => onEventClick?.(e)}
                      className="absolute left-1 right-1 rounded px-2 py-1 text-[12px] font-medium text-white shadow cursor-pointer"
                      style={{ top, height, background: e.color || '#2563eb' }}
                    >
                      <div className="leading-tight whitespace-normal break-words">{e.title}</div>
                      <div className="text-[10px] opacity-80 mt-0.5">
                        {s.segStart.format('h:mm a')} – {s.segEnd.format('h:mm a')}
                      </div>
                    </div>
                  );
                });
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
