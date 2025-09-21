import dayjs from 'dayjs';
import { hexToRgba, intersectsDay } from './gridUtils';

const MAX_ROWS_PER_DAY = 3; // how many lines before "+N more"
const FIXED_SIX_WEEKS = false;

export default function CalendarGridMonth({
  ...props
}) {
  const { monthStart, events = [], onDayClick, onEventClick, selectedDate } = props;

  const tz = dayjs.tz?.guess?.();                       // ← one timezone
  const m0 = dayjs(monthStart).startOf('month');
  const gridStart = m0.startOf('week');
  const gridEnd   = m0.endOf('month').endOf('week');

  const totalDays = FIXED_SIX_WEEKS ? 42 : gridEnd.diff(gridStart, 'day') + 1;
  const days = [...Array(totalDays)].map((_, i) => gridStart.add(i, 'day'));
  const month = m0.month();

  return (
    <div className={`h-full grid grid-cols-7 ${FIXED_SIX_WEEKS ? 'grid-rows-6' : ''} bg-white`}>
      {days.map((d) => {
        const inMonth = d.month() === month;

        const dayEvents = events.filter(e => intersectsDay(e, d, tz));   // ← TZ-safe
        const show = dayEvents.slice(0, MAX_ROWS_PER_DAY);
        const more = Math.max(0, dayEvents.length - show.length);

        return (
          <div key={d.format('YYYY-MM-DD')} className={`border p-1 flex flex-col ${inMonth ? 'bg-white' : 'bg-gray-50'}`}>
            <button
              type="button"
              className={`text-xs font-medium self-start rounded px-1 hover:bg-gray-100 ${inMonth ? 'text-gray-800' : 'text-gray-400'}`}
              onClick={() => onDayClick?.(d)}
            >
              {d.date()}
            </button>

            <div className="mt-1 space-y-1">
              {show.map((e, i) => {
                const startLocal = tz ? dayjs(e.start_at).tz(tz) : dayjs(e.start_at); // ← one timezone
                const showTime = startLocal.isSame(d, 'day');
                return (
                  <div
                    key={`m:${e.scope || 'x'}:${e.id}:${d.valueOf()}:${i}`}
                    data-ev-chip
                    onClick={(ev) => { ev.stopPropagation(); onEventClick?.(e); }}
                    className="text-[11px] rounded px-1.5 py-0.5 cursor-pointer truncate text-white"
                    style={{ background: hexToRgba(e.color || '#2563eb', 0.85) }}
                    title={e.title}
                  >
                    {showTime && <span className="opacity-90 mr-1">{startLocal.format('h:mm')}</span>}
                    <span>{e.title}</span>
                  </div>
                );
              })}
              {more > 0 && (
                <button type="button" onClick={() => onDayClick?.(d)} className="text-[11px] text-blue-700">
                  +{more} more
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
