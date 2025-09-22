import dayjs from 'dayjs';
import { useMemo } from 'react';
import {
  HOUR_PX, MIN_HEIGHT, OVERLAP_GAP_PX,
  minsSinceMidnight, segKey, hexToRgba,
  layoutDaySegments, buildSegmentsForEvent,
  intersectsDay,
} from './gridUtils';

export default function CalendarGridDay({ date, events = [], onEventClick }) {
  const day = dayjs(date).startOf('day');
  const weekStart = day.startOf('week');
  // Use only events that touch this specific day
  const dayEvents = useMemo(
    () => events.filter(e => intersectsDay(e, day)),
    [events, day.valueOf()]
  );
  const allDay = dayEvents.filter(e => e.all_day);
  const timed  = dayEvents.filter(e => !e.all_day);
  const publicCount  = dayEvents.filter(e => !e.is_vaulted).length;  // ✅ NEW
  const vaultedCount = dayEvents.filter(e =>  e.is_vaulted).length;  // ✅ NEW

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="border-b px-4 h-10 flex items-center text-sm font-semibold text-gray-800">
        {day.format('dddd, MMM D')}
      </div>

      {/* Summary bar: how many tasks today (modern chips) */}
      <div className="border-b bg-gray-50/70 px-3 py-2 flex items-center gap-2 text-xs">
        <span className="inline-flex items-center rounded-full bg-gray-800 text-white px-2.5 py-[2px] font-semibold">
          {dayEvents.length} tasks
        </span>
        <span className="inline-flex items-center rounded-full bg-blue-100 text-blue-700 px-2 py-[2px]">
          {dayEvents.filter(e => e.scope === 'workspace').length} workspaces
        </span>
        <span className="inline-flex items-center rounded-full bg-fuchsia-100 text-fuchsia-700 px-2 py-[2px]">
          {dayEvents.filter(e => e.scope === 'private').length} private
        </span>
        <span className="inline-flex items-center rounded-full bg-emerald-100 text-emerald-700 px-2 py-[2px]">
          {publicCount} public
        </span>
        <span className="inline-flex items-center rounded-full bg-slate-200 text-slate-700 px-2 py-[2px]">
          {vaultedCount} vaulted
        </span>
        <span className="ml-auto inline-flex items-center text-gray-500">
          {allDay.length} all-day · {timed.length} timed
        </span>
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
