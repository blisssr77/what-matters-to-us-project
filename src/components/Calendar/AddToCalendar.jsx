import { useState, useMemo, useEffect } from 'react'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import tzPlugin from 'dayjs/plugin/timezone'
dayjs.extend(utc)
dayjs.extend(tzPlugin)

const COLORS = ['#2563eb','#0ea5e9','#10b981','#f59e0b','#ef4444','#7c3aed','#6b7280']

// Convert date + time to ISO in the user's TZ
export function toISO({ date, time = '00:00', allDay, tz }) {
  if (!date) return null
  const base = time
    ? dayjs.tz(`${date} ${time}`, 'YYYY-MM-DD HH:mm', tz)
    : dayjs.tz(`${date}`, 'YYYY-MM-DD', tz)
  return (allDay ? base.startOf('day') : base).toISOString()
}

/**
 * Props:
 * - initial: { enabled, allDay, start_at, end_at, color, status, visibility }
 * - defaultColor (optional)
 * - isVaulted (boolean)  -> controls default visibility & hint text
 * - onChange(payload)    -> returns normalized payload (or null if disabled)
 *
 * The payload keys match your DB columns:
 *   { calendar_enabled, start_at, end_at, all_day, calendar_color, calendar_status, calendar_visibility }
 */
export default function AddToCalendar({
  initial = {},              // can be DB-shaped: {calendar_enabled, start_at, ...}
  defaultColor = '#2563eb',
  isVaulted = false,
  onChange,                  // (payload|null) => void
}) {
  const tz = dayjs.tz.guess()

  // accept both "enabled" and "calendar_enabled" for convenience
  const initEnabled = 'calendar_enabled' in initial ? !!initial.calendar_enabled : !!initial.enabled
  const [enabled, setEnabled]   = useState(initEnabled)
  const [allDay, setAllDay]     = useState(!!initial.allDay || !!initial.all_day)
  const [color, setColor]       = useState(initial.color || initial.calendar_color || (isVaulted ? '#7c3aed' : defaultColor))
  const [status, setStatus]     = useState(initial.status || initial.calendar_status || '')
  const [visibility, setVis]    = useState(initial.visibility || initial.calendar_visibility || (isVaulted ? 'masked' : 'public'))

  const [startDate, setStartDate] = useState(
    initial.start_at ? dayjs(initial.start_at).tz(tz).format('YYYY-MM-DD') : ''
  )
  const [startTime, setStartTime] = useState(
    initial.start_at && !(initial.allDay || initial.all_day)
      ? dayjs(initial.start_at).tz(tz).format('HH:mm')
      : '09:00'
  )
  const [endDate, setEndDate] = useState(
    initial.end_at ? dayjs(initial.end_at).tz(tz).format('YYYY-MM-DD') : ''
  )
  const [endTime, setEndTime] = useState(
    initial.end_at && !(initial.allDay || initial.all_day)
      ? dayjs(initial.end_at).tz(tz).format('HH:mm')
      : '10:00'
  )

  // build normalized payload (pure calculation)
  const payload = useMemo(() => {
    if (!enabled) return null
    const startISO = toISO({ date: startDate, time: allDay ? '00:00' : startTime, allDay, tz })
    const endISO   = endDate ? toISO({ date: endDate, time: allDay ? '23:59' : endTime, allDay, tz }) : null
    return {
      calendar_enabled: true,
      start_at: startISO,
      end_at: endISO,
      all_day: !!allDay,
      calendar_color: color || null,
      calendar_status: status || null,
      calendar_visibility: visibility || (isVaulted ? 'masked' : 'public'),
      // If/when you support repeat windows, pass them in via props and include here.
    }
  }, [enabled, allDay, startDate, startTime, endDate, endTime, color, status, visibility, isVaulted, tz])

  // ✅ notify parent AFTER render (fixes the warning)
  useEffect(() => {
    onChange?.(payload)    // payload or null
  }, [payload, onChange])

  return (
    <div className="rounded border p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="font-medium text-gray-800">Add to calendar</div>
        <label className="inline-flex items-center gap-2 text-sm">
          <input type="checkbox" checked={enabled} onChange={(e)=>setEnabled(e.target.checked)} />
          Enable
        </label>
      </div>

      {enabled && (
        <>
          {/* All-day */}
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" checked={allDay} onChange={(e)=>setAllDay(e.target.checked)} />
            All day
          </label>

          {/* Start / End */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="text-xs text-gray-500 block">Start</label>
              <div className="flex gap-2">
                <input type="date" className="border rounded px-2 py-1 text-sm w-full"
                  value={startDate} onChange={(e)=>setStartDate(e.target.value)} />
                {!allDay && (
                  <input type="time" className="border rounded px-2 py-1 text-sm w-28"
                    value={startTime} onChange={(e)=>setStartTime(e.target.value)} />
                )}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs text-gray-500 block">End (optional)</label>
              <div className="flex gap-2">
                <input type="date" className="border rounded px-2 py-1 text-sm w-full"
                  value={endDate} onChange={(e)=>setEndDate(e.target.value)} />
                {!allDay && (
                  <input type="time" className="border rounded px-2 py-1 text-sm w-28"
                    value={endTime} onChange={(e)=>setEndTime(e.target.value)} />
                )}
              </div>
            </div>
          </div>

          {/* Color */}
          <div className="space-y-1">
            <label className="text-xs text-gray-500 block">Color</label>
            <div className="flex flex-wrap gap-2">
              {COLORS.map(c => (
                <button key={c} type="button"
                  onClick={()=>setColor(c)}
                  className={`w-6 h-6 rounded-full ring-2 ${color===c ? 'ring-black' : 'ring-transparent'}`}
                  style={{ backgroundColor: c }}
                  title={c}
                />
              ))}
              <input
                type="color"
                value={color}
                onChange={(e)=>setColor(e.target.value)}
                className="ml-2 h-6 w-10 p-0 border rounded cursor-pointer"
                title="Custom color"
              />
            </div>
          </div>

          {/* Status & Visibility */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Status</label>
              <select
                className="border rounded px-2 py-1 text-sm w-full"
                value={status}
                onChange={(e)=>setStatus(e.target.value)}
              >
                <option value="">None</option>
                <option value="planned">Planned</option>
                <option value="in_progress">In progress</option>
                <option value="done">Done</option>
              </select>
            </div>

            <div>
              <label className="text-xs text-gray-500 block mb-1">Visibility</label>
              <select
                className="border rounded px-2 py-1 text-sm w-full"
                value={visibility}
                onChange={(e)=>setVis(e.target.value)}
              >
                <option value="public">Public (show title)</option>
                <option value="masked">Masked {isVaulted ? '(recommended)' : ''}</option>
              </select>
              {isVaulted && (
                <p className="text-[11px] text-gray-500 mt-1">
                  Masked shows “🔐 Vaulted doc” to non-authorized members.
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
