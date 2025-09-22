import dayjs from 'dayjs';
import { useMemo, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Lock, Globe } from 'lucide-react';
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

  // --- “+N more” popover state ---
  const [moreOpen, setMoreOpen] = useState(false);
  const [moreDay, setMoreDay]   = useState(null);     // dayjs
  const [anchorRect, setAnchorRect] = useState(null); // DOMRect from the +N button

  const openMore = useCallback((day, ev) => {
    setMoreDay(day);
    setAnchorRect(ev?.currentTarget?.getBoundingClientRect?.() || null);
    setMoreOpen(true);
  }, []);
  const closeMore = useCallback(() => setMoreOpen(false), []);

  // Compute the full list for the selected day
  const moreList = useMemo(() => {
    if (!moreOpen || !moreDay) return [];
    return events
      .filter(e => intersectsDay(e, moreDay, tz))
      .sort((a, b) => {
        // all-day first, then by start time
        if (!!a.all_day !== !!b.all_day) return a.all_day ? -1 : 1;
        const as = dayjs(a.start_at); const bs = dayjs(b.start_at);
        return as.valueOf() - bs.valueOf();
      });
  }, [moreOpen, moreDay, events, tz]);

  // Position popover near the clicked “+N more” (fallback to centered)
  const popStyle = useMemo(() => {
    if (!anchorRect) return {
      top: '20vh', left: '50%', transform: 'translateX(-50%)',
      width: 360
    };
    const top  = Math.min(window.innerHeight - 320, anchorRect.bottom + 8);
    const left = Math.min(window.innerWidth  - 380,  anchorRect.left);
    return { top, left, width: 360, position: 'fixed' };
  }, [anchorRect]);

  // --- helpers for summary ---
  const uniqByScopeId = (list = []) => {
    const seen = new Set(); const out = [];
    for (const e of list) {
      const k = `${e.scope || 'x'}:${e.id}`;
      if (!seen.has(k)) { seen.add(k); out.push(e); }
    }
    return out;
  };

  // All unique events that intersect ANY day in this month grid
  const monthEvents = useMemo(() => {
    const touch = events.filter(e => days.some(d => intersectsDay(e, d, tz)));
    return uniqByScopeId(touch);
  }, [events, gridStart.valueOf(), gridEnd.valueOf(), tz]);

  const monthTotals = useMemo(() => {
    const total  = monthEvents.length;
    const ws     = monthEvents.filter(e => e.scope === 'workspace').length;
    const pspace = monthEvents.filter(e => e.scope === 'private').length;
    const pub    = monthEvents.filter(e => !e.is_vaulted).length;
    const vault  = monthEvents.filter(e =>  e.is_vaulted).length;
    const allDay = monthEvents.filter(e => e.all_day).length;
    const timed  = total - allDay;
    return { total, ws, pspace, pub, vault, allDay, timed };
  }, [monthEvents]);

  return (
    <div className="h-full flex flex-col bg-white">
        {/*  Monthly summary header */}
        <div className="border-b bg-gray-50/70 text-xs text-gray-700 px-3 py-2 flex items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-gray-800 text-white px-2.5 py-[2px] font-semibold">
                {monthTotals.total} tasks
            </span>
            <span className="inline-flex items-center rounded-full bg-blue-100 text-blue-700 px-2 py-[2px]">
                {monthTotals.ws} workspaces
            </span>
            <span className="inline-flex items-center rounded-full bg-fuchsia-100 text-fuchsia-700 px-2 py-[2px]">
                {monthTotals.pspace} private
            </span>
            <span className="inline-flex items-center rounded-full bg-emerald-100 text-emerald-700 px-2 py-[2px]">
                {monthTotals.pub} public
            </span>
            <span className="inline-flex items-center rounded-full bg-slate-200 text-slate-700 px-2 py-[2px]">
                {monthTotals.vault} vaulted
            </span>
            <span className="ml-auto inline-flex items-center text-gray-500">
                {monthTotals.allDay} all-day · {monthTotals.timed} timed
            </span>
        </div>

        {/* 7-column grid of days */}
        <div className={`flex-1 grid grid-cols-7 ${FIXED_SIX_WEEKS ? 'grid-rows-6' : ''}`}>
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

                    {/* Events list (max 3 shown, then "+N more" button) */}
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
                            <button
                                type="button"
                                onClick={(ev) => openMore(d, ev)}
                                className="text-[11px] text-blue-700 hover:underline"
                            >
                                +{more} more
                            </button>
                        )}
                    </div>
                </div>
            )})}
        </div>
        {/* --- “All items for this day” popover --- */}
        {moreOpen && createPortal(
          <>
            <div className="fixed inset-0 z-[999] bg-black/10" onClick={closeMore} />
            <div
              className="z-[1000] rounded-xl border bg-white shadow-2xl"
              style={popStyle}
              role="dialog"
              aria-modal="true"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-3 py-2 border-b">
                <div className="text-sm font-semibold text-gray-800">
                  {moreDay?.format('dddd, MMM D')} — {moreList.length} items
                </div>
                <button
                  className="p-1 rounded hover:bg-gray-100 text-gray-600"
                  onClick={closeMore}
                  aria-label="Close"
                >
                  <X size={16} />
                </button>
              </div>

              {/* List */}
              <div className="max-h-[60vh] overflow-auto p-2">
                {moreList.length === 0 ? (
                  <div className="p-4 text-xs text-gray-500">No events.</div>
                ) : (
                  <ul className="space-y-2">
                    {moreList.map((e) => {
                      const color = e.color || '#2563eb';
                      const bg    = hexToRgba(color, 0.08);
                      const startL = tz ? dayjs(e.start_at).tz(tz) : dayjs(e.start_at);
                      const endL   = e.end_at ? (tz ? dayjs(e.end_at).tz(tz) : dayjs(e.end_at)) : null;
                      const timeStr = e.all_day ? 'All day' : `${startL.format('h:mm a')}${endL ? ' – ' + endL.format('h:mm a') : ''}`;
                      const scope = e.scope === 'private' ? 'Private' : 'Workspace';
                      const isPublic = !e.is_vaulted;

                      return (
                        <li
                          key={`list:${e.scope || 'x'}:${e.id}`}
                          className="rounded-lg border flex items-start gap-2 p-2"
                          style={{ background: bg, borderLeft: `4px solid ${color}` }}
                        >
                          <div className="mt-0.5 shrink-0 w-2 h-2 rounded-full"
                               style={{ background: color }} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <div className="text-sm font-medium text-gray-900 truncate">{e.title || 'Untitled'}</div>
                              <span className={`text-[10px] px-1.5 py-[1px] rounded-full ${e.scope === 'private' ? 'bg-fuchsia-100 text-fuchsia-700' : 'bg-blue-100 text-blue-700'}`}>
                                {scope}
                              </span>
                              <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-[1px] rounded-full ${isPublic ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-700'}`}>
                                {isPublic ? <Globe size={12}/> : <Lock size={12}/>}
                                {isPublic ? 'Public' : 'Vaulted'}
                              </span>
                            </div>
                            <div className="text-xs text-gray-600 mt-0.5">{timeStr}</div>
                            {e.tags?.length ? (
                              <div className="mt-1 flex flex-wrap gap-1">
                                {e.tags.map((t) => (
                                  <span key={t} className="text-[10px] px-1 py-[1px] rounded bg-gray-100 text-gray-700">
                                    {t}
                                  </span>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {/* Footer actions (optional) */}
              <div className="p-2 flex items-center justify-end gap-2 border-t">
                <button
                  className="text-xs px-2.5 py-1 rounded border hover:bg-gray-50"
                  onClick={() => {
                    if (moreDay) onDayClick?.(moreDay); // jump to that day view/week
                    closeMore();
                  }}
                >
                  Open day
                </button>
                <button
                  className="text-xs px-2.5 py-1 rounded bg-gray-900 text-white hover:bg-black/90"
                  onClick={closeMore}
                >
                  Close
                </button>
              </div>
            </div>
          </>,
          document.body
        )}
    </div>
  );
}
