// src/components/Calendar/CalendarGridDay.jsx
import dayjs from 'dayjs';
import {
  HOUR_PX, MIN_HEIGHT, OVERLAP_GAP_PX,
  minsSinceMidnight, segKey, hexToRgba,
  layoutDaySegments, buildSegmentsForEvent
} from './gridUtils';

export default function CalendarGridDay({ date, events = [], onEventClick }) {
  const day = dayjs(date).startOf('day');
  const weekStart = day.startOf('week');
  const allDay = events.filter(e => e.all_day);
  const timed = events.filter(e => !e.all_day);

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="border-b px-4 h-10 flex items-center text-sm font-semibold text-gray-800">
        {day.format('dddd, MMM D')}
      </div>

      {/* All-day row */}
      <div className="grid grid-cols-[64px_1fr] border-b">
        <div className="px-2 py-2 text-xs text-gray-500">All-day</div>
        <div className="relative min-h-10">
          {allDay.map(e => {
            const start = dayjs(e.start_at);
            const end = e.end_at ? dayjs(e.end_at) : start;
            if (!(start.isBefore(day.endOf('day')) && end.isAfter(day.startOf('day')))) return null;
            return (
              <div
                key={`allday:${e.scope || 'x'}:${e.id}:${day.valueOf()}`}
                className="absolute left-0 right-0 px-1"
                style={{ top: 4 + (e._rowIndex || 0) * 28 }}
              >
                <div
                  onClick={() => onEventClick?.(e)}
                  className="text-xs font-medium text-white rounded px-2 py-1 cursor-pointer"
                  style={{ background: e.color || '#2563eb' }}
                >
                  {e.title}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Time grid */}
      <div className="flex-1 min-h-0 grid grid-cols-[64px_1fr] overflow-auto">
        {/* hour gutter */}
        <div className="relative bg-white">
          {[...Array(24)].map((_, h) => (
            <div key={h} className="h-[64px] border-b text-[11px] text-right pr-2 text-gray-400">
              {h === 0 ? '' : dayjs().hour(h).minute(0).format('h A')}
            </div>
          ))}
        </div>

        {/* day column */}
        <div className="relative border-l bg-white">
          {[...Array(24)].map((_, h) => (
            <div key={h} className="h-[64px] border-b" />
          ))}

          {(() => {
            const dayItems = [];
            for (const ev of timed) {
              const segs = buildSegmentsForEvent(ev, weekStart);
              for (const s of segs) {
                if (!s.segStart.isSame(day, 'day')) continue;
                const top = (minsSinceMidnight(s.segStart) / 60) * HOUR_PX;
                const heightMin = Math.max(1, s.segEnd.diff(s.segStart, 'minute'));
                const height = Math.max(MIN_HEIGHT, (heightMin / 60) * HOUR_PX);
                dayItems.push({
                  id: segKey(ev, day.day(), s),
                  segStart: s.segStart,
                  segEnd: s.segEnd,
                  top, height,
                  event: ev,
                });
              }
            }
            const laidOut = layoutDaySegments(dayItems);
            return laidOut.map(it => {
              const e = it.event;
              return (
                <div
                  key={it.id}
                  onClick={() => onEventClick?.(e)}
                  className="absolute rounded px-2 py-1 text-[12px] font-medium text-white shadow cursor-pointer hover:shadow-md hover:z-10"
                  style={{
                    top: it.top,
                    height: it.height,
                    left: `calc(${it.leftPct}% + ${OVERLAP_GAP_PX}px)`,
                    width: `calc(${it.widthPct}% - ${OVERLAP_GAP_PX * 2}px)`,
                    background: hexToRgba(e.color || '#2563eb', 0.85),
                    borderLeft: `3px solid ${hexToRgba(e.color || '#2563eb', 1)}`,
                  }}
                >
                  <div className="leading-tight">{e.title}</div>
                  <div className="text-[10px] opacity-90 mt-0.5">
                    {it.segStart.format('h:mm a')} – {it.segEnd.format('h:mm a')}
                  </div>
                </div>
              );
            });
          })()}
        </div>
      </div>
    </div>
  );
}
