import dayjs from 'dayjs'
import { useMemo } from 'react'

import {
  HOUR_PX, MIN_HEIGHT, OVERLAP_GAP_PX,
  minsSinceMidnight, segKey, hexToRgba,
  layoutDaySegments, buildSegmentsForEvent,
  intersectsDay,
} from './gridUtils';

export default function CalendarGridWeek({ startOfWeek, events = [], onEventClick }) {
  const weekStart = dayjs(startOfWeek);
  const days = [...Array(7)].map((_, i) => weekStart.add(i, 'day'));

  // ---------- dedupe helper by scope + id ----------
  const uniqByScopeId = (list = []) => {
    const seen = new Set(); const out = [];
    for (const e of list) {
      const k = `${e.scope || 'x'}:${e.id}`;
      if (!seen.has(k)) { seen.add(k); out.push(e); }
    }
    return out;
  };

  // ---------- all unique events that intersect this week ----------
  const weekEvents = useMemo(() => {
    const touchWeek = events.filter(e => days.some(d => intersectsDay(e, d)));
    return uniqByScopeId(touchWeek);
  }, [events, weekStart.valueOf()]);

  // ---------- weekly totals ----------
  const weekTotals = useMemo(() => {
    const total  = weekEvents.length;
    const ws     = weekEvents.filter(e => e.scope === 'workspace').length;
    const pspace = weekEvents.filter(e => e.scope === 'private').length;
    const pub    = weekEvents.filter(e => !e.is_vaulted).length;
    const vault  = weekEvents.filter(e =>  e.is_vaulted).length;
    const allDay = weekEvents.filter(e => e.all_day).length;
    const timed  = total - allDay;
    return { total, ws, pspace, pub, vault, allDay, timed };
  }, [weekEvents]);

  const allDay = events.filter(e => e.all_day);
  const timedRaw = events.filter(e => !e.all_day);
  const seen = new Set();
  const timed = timedRaw.filter(e => {
    const k = `${e.scope || 'x'}:${e.id}:${e.start_at}:${e.end_at || ''}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  return (
    <div className="h-full flex flex-col">
      {/* header */}
      <div className="grid grid-cols-[64px_repeat(7,1fr)] border-b bg-white sticky top-0 z-1 text-gray-600">
        <div className="h-10" />
        {days.map(d => (
          <div key={d.format('YYYY-MM-DD')} className="h-10 px-3 flex items-center border-l">
            <div className="text-xs font-bold text-gray-800">
              {d.format('ddd D')}
            </div>
          </div>
        ))}
      </div>

      {/*  Weekly summary (totals for the whole range) */}
      <div className="grid grid-cols-[64px_1fr] border-b bg-gray-50/70 text-xs text-gray-700">
        {/* left gutter label */}
        <div className="h-8 px-2 flex items-center text-gray-500">Week</div>

        {/* chips */}
        <div className="h-8 px-2 flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center rounded-full bg-gray-800 text-white px-2.5 py-[2px] font-semibold">
            {weekTotals.total} tasks
          </span>
          <span className="inline-flex items-center rounded-full bg-blue-100 text-blue-700 px-2 py-[2px]">
            {weekTotals.ws} workspaces
          </span>
          <span className="inline-flex items-center rounded-full bg-fuchsia-100 text-fuchsia-700 px-2 py-[2px]">
            {weekTotals.pspace} private spaces
          </span>
          <span className="inline-flex items-center rounded-full bg-emerald-100 text-emerald-700 px-2 py-[2px]">
            {weekTotals.pub} public
          </span>
          <span className="inline-flex items-center rounded-full bg-slate-200 text-slate-700 px-2 py-[2px]">
            {weekTotals.vault} vaulted
          </span>
          <span className="ml-auto inline-flex items-center text-gray-500">
            {weekTotals.allDay} all-day · {weekTotals.timed} timed
          </span>
        </div>
      </div>

      {/* all-day row (supports spans) */}
      <div className="grid grid-cols-[64px_repeat(7,1fr)] border-b bg-white">
        <div className="px-2 py-2 text-xs text-gray-500">All-day</div>
        {/* we’ll render positioned chips that span columns */}
        <div className="col-span-7 relative min-h-10">
          {allDay.map(e => {
            const start = dayjs(e.start_at);
            const end   = e.end_at ? dayjs(e.end_at) : start;
            const first = Math.max(0, start.diff(weekStart.startOf('day'), 'day'));
            const last  = Math.min(6, end.diff(weekStart.startOf('day'), 'day'));
            const colStart = 1 + first;
            const span = Math.max(1, last - first + 1);

            return (
              <div
                key={`allday:${e.scope || 'x'}:${e.id}:${start.valueOf()}:${(e.end_at ? dayjs(e.end_at) : start).valueOf()}`}
                className="absolute left-0 right-0 px-1"
                style={{ top: 4 + (e._rowIndex || 0) * 28 }}
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
            {(() => {
              const dayItems = [];
              for (const ev of timed) {
                const segs = buildSegmentsForEvent(ev, weekStart);
                for (const s of segs) {
                  if (s.dayIndex !== dayIdx) continue;
                  const top = (minsSinceMidnight(s.segStart) / 60) * HOUR_PX;
                  const heightMin = Math.max(1, s.segEnd.diff(s.segStart, 'minute'));
                  const height = Math.max(MIN_HEIGHT, (heightMin / 60) * HOUR_PX);
                  dayItems.push({
                    id: segKey(ev, dayIdx, s),   // unique key
                    segStart: s.segStart,
                    segEnd: s.segEnd,
                    top,
                    height,
                    event: ev,
                  });
                }
              }

              const laidOut = layoutDaySegments(dayItems);

              // if (import.meta.env.DEV) {
              //   const keys = laidOut.map(x => x.id);
              //   console.log('keys for day', dayIdx, d.format('YYYY-MM-DD'), keys);
              //   const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
              //   if (dupes.length) console.warn('DUPED KEYS', { dayIdx, dupes });
              // }

              return laidOut.map(it => {
                const e = it.event;
                const bg = hexToRgba(e.color || '#2563eb', 0.9);
                const border = hexToRgba(e.color || '#2563eb', 1);
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
                      background: bg,
                      borderLeft: `3px solid ${border}`,
                    }}
                  >
                    <div className="leading-tight whitespace-normal break-words">{e.title}</div>
                    <div className="text-[10px] opacity-90 mt-0.5">
                      {it.segStart.format('h:mm a')} – {it.segEnd.format('h:mm a')}
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        ))}
      </div>
    </div>
  );
}
